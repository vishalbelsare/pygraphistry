'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:histogramBrush');
var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');
var _       = require('underscore');

var HistogramsPanel = require('./histogramPanel');
var util    = require('./util.js');
var Command = require('./command.js');


//////////////////////////////////////////////////////////////////////////////
// CONSTANTS
//////////////////////////////////////////////////////////////////////////////

var DRAG_SAMPLE_INTERVAL = 200;


//////////////////////////////////////////////////////////////////////////////
// Rx/State
//////////////////////////////////////////////////////////////////////////////

var EmptySelectionMessage = '<p class="bg-danger text-center">Empty Selection.</p>';

function handleFiltersResponse (filtersResponseObservable, poi) {
    filtersResponseObservable
        .do(function (res) {
            // Invalidate cache now that a filter has executed and possibly changed indices.
            var $histogramErrors = $('#histogramErrors');
            if (!res.success && res.error === 'empty selection') {
                $histogramErrors.html(EmptySelectionMessage);
                return;
            }

            $histogramErrors.empty();
            poi.emptyCache();
        })
        .subscribe(_.identity, util.makeErrorHandler('Emit Filter'));
}


function HistogramBrush(socket, filtersPanel) {
    debug('Initializing histogram brush');

    this.lastSelection = undefined;
    this.activeDataframeAttributes = [];
    this.dataframeAttributeChange = new Rx.Subject();

    // Grab global stats at initialization
    this.globalStats = new Rx.ReplaySubject(1);
    var updateDataframeAttributeSubject = new Rx.Subject();

    this.aggregationCommand = new Command('aggregate', socket);

    //////////////////////////////////////////////////////////////////////////
    // Setup Streams
    //////////////////////////////////////////////////////////////////////////

    // Setup update attribute subject that histogram panel can write to
    updateDataframeAttributeSubject.do(function (data) {
        this.updateDataframeAttribute(data.oldAttr, data.newAttr, data.type);
    }.bind(this)).subscribe(_.identity, util.makeErrorHandler('Update Attribute'));

    this.filtersSubjectFromHistogram = new Rx.ReplaySubject(1);

    // Setup initial stream of global statistics.
    var globalStream = this.aggregatePointsAndEdges({
        all: true});
    var globalStreamSparklines = this.aggregatePointsAndEdges({
        all: true,
        binning: {'_goalNumberOfBins': HistogramsPanel.NUM_SPARKLINES}});
    Rx.Observable.zip(globalStream, globalStreamSparklines, function (histogramsReply, sparkLinesReply) {
        checkReply(histogramsReply);
        checkReply(sparkLinesReply);
        return {histograms: histogramsReply.data, sparkLines: sparkLinesReply.data};
    }).do(function (data) {
        var attributes = _.filter(_.keys(data.histograms), function (val) {
            return (val !== '_title');
        });

        this.histogramsPanel = new HistogramsPanel(
            data, attributes, filtersPanel,
            this.filtersSubjectFromHistogram, this.dataframeAttributeChange, updateDataframeAttributeSubject);
        data.histogramPanel = this.histogramsPanel;

        // On auto-populate, at most 5 histograms, or however many * 85 + 110 px = window height.
        var maxInitialItems = Math.min(Math.round((window.innerHeight - 110) / 85), 5);
        var filteredAttributes = {};
        var firstKeys = _.first(_.keys(data.sparkLines), maxInitialItems);
        _.each(firstKeys, function (key) {
            filteredAttributes[key] = data.sparkLines[key];
            filteredAttributes[key].sparkLines = true;
            this.updateDataframeAttribute(null, key, 'sparkLines');
        }, this);
        this.updateHistogramData(filteredAttributes, data, true);

    }.bind(this)).subscribe(this.globalStats, util.makeErrorHandler('Global stat aggregate call'));
}


HistogramBrush.prototype.setupFiltersInteraction = function(filtersPanel, poi) {
    // Setup filtering:
    filtersPanel.listenToHistogramChangesFrom(this.filtersSubjectFromHistogram);
    handleFiltersResponse(filtersPanel.control.filtersResponsesObservable(), poi);
};


/**
 * Take stream of selections and drags and use them for histograms
 */
HistogramBrush.prototype.setupMarqueeInteraction = function(marquee) {
    marquee.selections.map(function (val) {
        return {type: 'selection', sel: val};
    }).merge(marquee.drags.sample(DRAG_SAMPLE_INTERVAL).map(function (val) {
            return {type: 'drag', sel: val};
        })
    ).merge(this.dataframeAttributeChange.map(function () {
            return {type: 'dataframeAttributeChange', sel: this.lastSelection};
        }, this)
    ).flatMapLatest(function (selContainer) {
        return this.globalStats.map(function (globalVal) {
            return {type: selContainer.type, sel: selContainer.sel, globalStats: globalVal};
        });
    }.bind(this)).flatMapLatest(function (data) {
        var binning = {};
        var attributeNames = _.pluck(this.activeDataframeAttributes, 'name');
        _.each(this.activeDataframeAttributes, function (attr) {
            if (attr.type === 'sparkLines') {
                binning[attr.name] = data.globalStats.sparkLines[attr.name];
            } else {
                binning[attr.name] = data.globalStats.histograms[attr.name];
            }
        });
        var attributes = _.map(attributeNames, function (name) {
            return {
                name: name,
                type: data.globalStats.histograms[name].dataType
            };
        });

        var params = {sel: data.sel, attributes: attributes, binning: binning};
        this.lastSelection = data.sel;
        return this.aggregationCommand.sendWithObservableResult(params, true)
            .map(function (agg) {
                return _.extend(data, {reply: agg});
            });
    }.bind(this)).do(function (data) {
        if (!data.reply) {
            console.error('Unexpected server error on aggregate');
        } else if (data.reply && !data.reply.success) {
            console.error('Server replied with error:', data.reply.error, data.reply.stack);
        }
    // TODO: Do we want to treat no replies in some special way?
    }).filter(function (data) { return data.reply && data.reply.success; })
    .do(function (data) {
        this.updateHistogramData(data.reply.data, data.globalStats);
    }.bind(this)).subscribe(_.identity, util.makeErrorHandler('Brush selection aggregate error'));
};


HistogramBrush.prototype.updateDataframeAttribute = function (oldAttributeName, newAttributeName, type) {
    // Delete old if it exists
    var indexOfOld = _.pluck(this.activeDataframeAttributes, 'name').indexOf(oldAttributeName);
    if (indexOfOld > -1) {
        this.activeDataframeAttributes.splice(indexOfOld, 1);
    }

    // Add new one if it exists
    if (newAttributeName) {
        this.activeDataframeAttributes.push({name: newAttributeName, type: type});
    }

    // Only resend selections if an add/update
    if (newAttributeName) {
        this.dataframeAttributeChange.onNext(newAttributeName);
    }
};


function checkReply(reply) {
    if (!reply) {
        console.error('Unexpected server error on global aggregate');
    } else if (reply && !reply.success) {
        console.error('Server replied with error from global aggregate:', reply.error, reply.stack);
    }
}

HistogramBrush.prototype.updateHistogramData = function (data, globalStats, empty) {
    var histograms = [];
    var Model = this.histogramsPanel.model;
    var collection = this.histogramsPanel.collection;
    var length = collection.length;

    // Update models that exist.
    collection.each(function (histogram) {
        var attr = histogram.get('attribute');
        if (data[attr] !== undefined) {
            var params = {
                data: empty ? {} : data[attr],
                timeStamp: Date.now()
            };
            histogram.set(params);
            delete data[attr];
            histograms.push(histogram);
        }
    });

    _.each(data, function (val, key) {
        var histogram = new Model();
        var params = {
            data: empty ? {} : val,
            globalStats: globalStats,
            timeStamp: Date.now(),
            position: length++
        };

        if (val.sparkLines !== undefined) {
            params.sparkLines = val.sparkLines;
        } else {
            // TODO: Make sure that sparkLines is always passed in, so we don't have
            // to do this check.
            _.each(this.activeDataframeAttributes, function (attr) {
                if (attr.name === key) {
                    params.sparkLines = (attr.type === 'sparkLines');
                }
            });
        }

        histogram.set(params);
        histogram.id = key;
        histogram.set('attribute', key);
        histograms.push(histogram);

    }.bind(this));

    collection.set(histograms);
};


// ?? -> Observable ??
HistogramBrush.prototype.aggregatePointsAndEdges = function(params) {
    return Rx.Observable.zip(
        this.aggregationCommand.sendWithObservableResult(_.extend({}, params, {type: 'point'}), true),
        this.aggregationCommand.sendWithObservableResult(_.extend({}, params, {type: 'edge'}), true),
        function (pointHists, edgeHists) {

            _.each(pointHists.data, function (val) {
                val.dataType = 'point';
            });
            _.each(edgeHists.data, function (val) {
                val.dataType = 'edge';
            });

            return {success: pointHists.success && edgeHists.success,
                    data: _.extend({}, pointHists.data || {}, edgeHists.data || {})};
        });
};


module.exports = HistogramBrush;

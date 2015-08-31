'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:histogramBrush');
var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');
var _       = require('underscore');

var histogramPanel = require('./histogramPanel');
var filterPanel = require('./filterPanel');
var util    = require('./util.js');


//////////////////////////////////////////////////////////////////////////////
// CONSTANTS
//////////////////////////////////////////////////////////////////////////////

var DRAG_SAMPLE_INTERVAL = 200;
// TODO: Move these out of module global scope.
var lastSelection;
var activeDataframeAttributes = [];
var dataframeAttributeChange = new Rx.Subject();


//////////////////////////////////////////////////////////////////////////////
// Rx/State
//////////////////////////////////////////////////////////////////////////////

function updateDataframeAttribute (oldAttributeName, newAttributeName, type) {
    // Delete old if it exists
    var indexOfOld = _.pluck(activeDataframeAttributes, 'name').indexOf(oldAttributeName);
    if (indexOfOld > -1) {
        activeDataframeAttributes.splice(indexOfOld, 1);
    }

    // Add new one if it exists
    if (newAttributeName) {
        activeDataframeAttributes.push({name: newAttributeName, type: type});
    }

    // Only resend selections if an add/update
    if (newAttributeName) {
        dataframeAttributeChange.onNext(newAttributeName);
    }
}


function init(socket, marquee, poi) {
    debug('Initializing histogram brush');

    // Grab global stats at initialization
    var globalStats = new Rx.ReplaySubject(1);
    var updateDataframeAttributeSubject = new Rx.Subject();

    //////////////////////////////////////////////////////////////////////////
    // Backbone views and models
    //////////////////////////////////////////////////////////////////////////
    // We only fill this in once Rx sets up its histogram chain; from histogramPanel.initHistograms.
    var HistogramModel;

    //////////////////////////////////////////////////////////////////////////
    // Setup Streams
    //////////////////////////////////////////////////////////////////////////

    // Setup filtering
    var filtersPanel = filterPanel.init(),
        allFiltersView = filtersPanel.view,
        filterSet = filtersPanel.collection,
        FilterModel = filtersPanel.model;

    // Setup update attribute subject that histogram panel can write to
    updateDataframeAttributeSubject.do(function (data) {
        updateDataframeAttribute(data.oldAttr, data.newAttr, data.type);
    }).subscribe(_.identity, util.makeErrorHandler('Update Attribute'));

    // Setup initial stream of global statistics.
    var globalStream = aggregatePointsAndEdges(socket,
        {all: true});
    var globalStreamSparklines = aggregatePointsAndEdges(socket,
        {all: true, binning: {'_goalNumberOfBins': histogramPanel.NUM_SPARKLINES}});
    Rx.Observable.zip(globalStream, globalStreamSparklines, function (histogramsReply, sparkLinesReply) {
        checkReply(histogramsReply);
        checkReply(sparkLinesReply);
        return {histograms: histogramsReply.data, sparkLines: sparkLinesReply.data};
    }).do(function (data) {
        var attributes = _.filter(_.keys(data.histograms), function (val) {
            return (val !== '_title');
        });

        var primaryPanel = histogramPanel.initHistograms(
                data, attributes, filterSet, dataframeAttributeChange, updateDataframeAttributeSubject),
            histograms = primaryPanel.collection;
        HistogramModel = primaryPanel.model;

        // On auto-populate, at most 5 histograms, or however many * 85 + 110 px = window height.
        var maxInitialItems = Math.min(Math.round((window.innerHeight - 110) / 85), 5);
        var filteredAttributes = {};
        var firstKeys = _.first(_.keys(data.sparkLines), maxInitialItems);
        _.each(firstKeys, function (key) {
            filteredAttributes[key] = data.sparkLines[key];
            filteredAttributes[key].sparkLines = true;
            updateDataframeAttribute(null, key, 'sparkLines');
        });
        updateHistogramData(histograms, filteredAttributes, data, HistogramModel, true);

    }).subscribe(globalStats, util.makeErrorHandler('Global stat aggregate call'));


    // Take stream of selections and drags and use them for histograms
    marquee.selections.map(function (val) {
        return {type: 'selection', sel: val};
    }).merge(marquee.drags.throttleFirst(DRAG_SAMPLE_INTERVAL).map(function (val) {
            return {type: 'drag', sel: val};
        })
    ).merge(dataframeAttributeChange.map(function () {
            return {type: 'dataframeAttributeChange', sel: lastSelection};
        })
    ).flatMapLatest(function (selContainer) {
        return globalStats.map(function (globalVal) {
            return {type: selContainer.type, sel: selContainer.sel, globalStats: globalVal};
        });

    }).flatMapLatest(function (data) {
        var binning = {};
        var attributeNames = _.pluck(activeDataframeAttributes, 'name');
        _.each(activeDataframeAttributes, function (attr) {
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
        lastSelection = data.sel;
        return Rx.Observable.fromCallback(socket.emit, socket)('aggregate', params)
            .map(function (agg) {
                return {reply: agg, sel: data.sel, globalStats: data.globalStats, type: data.type};
            });
    }).do(function (data) {
        if (!data.reply) {
            console.error('Unexpected server error on aggregate');
        } else if (data.reply && !data.reply.success) {
            console.error('Server replied with error:', data.reply.error, data.reply.stack);
        }
    // TODO: Do we want to treat no replies in some special way?
    }).filter(function (data) { return data.reply && data.reply.success; })
    .do(function (data) {
        updateHistogramData(histograms, data.reply.data, data.globalStats, HistogramModel);
    }).subscribe(_.identity, util.makeErrorHandler('Brush selection aggregate error'));
}


function checkReply(reply) {
    if (!reply) {
        console.error('Unexpected server error on global aggregate');
    } else if (reply && !reply.success) {
        console.error('Server replied with error from global aggregate:', reply.error, reply.stack);
    }
}

function updateHistogramData(collection, data, globalStats, Model, empty) {
    var histograms = [];
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
            _.each(activeDataframeAttributes, function (attr) {
                if (attr.name === key) {
                    params.sparkLines = (attr.type === 'sparkLines');
                }
            });
        }

        histogram.set(params);
        histogram.id = key;
        histogram.set('attribute', key);
        histograms.push(histogram);

    });

    collection.set(histograms);
}


//socket * ?? -> Observable ??
function aggregatePointsAndEdges(socket, params) {
    return Rx.Observable.zip(
        Rx.Observable.fromCallback(socket.emit, socket)('aggregate', _.extend({}, params, {type: 'point'})),
        Rx.Observable.fromCallback(socket.emit, socket)('aggregate', _.extend({}, params, {type: 'edge'})),
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
}


module.exports = {
    init: init
};

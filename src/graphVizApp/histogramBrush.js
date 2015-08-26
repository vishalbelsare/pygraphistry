'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:histogramBrush');
var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');
var _       = require('underscore');

var histogramPanel = require('./histogramPanel');
var util    = require('./util.js');


//////////////////////////////////////////////////////////////////////////////
// CONSTANTS
//////////////////////////////////////////////////////////////////////////////

var DRAG_SAMPLE_INTERVAL = 200;
var lastSelection;
var activeAttributes = [];
var attributeChange = new Rx.Subject();


//////////////////////////////////////////////////////////////////////////////
// Rx/State
//////////////////////////////////////////////////////////////////////////////

function updateAttribute (oldAttribute, newAttribute, type) {
    // Delete old if it exists
    var indexOfOld = _.pluck(activeAttributes, 'name').indexOf(oldAttribute);
    if (indexOfOld > -1) {
        activeAttributes.splice(indexOfOld, 1);
    }

    // Add new one if it exists
    if (newAttribute) {
        activeAttributes.push({name: newAttribute, type: type});
    }

    // Only resend selections if an add/update
    if (newAttribute) {
        attributeChange.onNext(newAttribute);
    }
}


// TODO: Pull this out of histogram tool, since it's a filtering call.
function setupSendHistogramFilters (subject, socket, poi) {
    subject.do(function (filters) {

        Rx.Observable.fromCallback(socket.emit, socket)('filter', filters)
            .do(function (res) {
                // Invalidate cache now that a filter has executed and possibly changed indices.
                if (!res.success && res.error === 'empty selection') {
                    $('#histogramErrors').html('<p style="color: red; text-align: center">Empty Selection.</p>');
                    return;
                }

                $('#histogramErrors').empty();
                poi.emptyCache();
            })
            .subscribe(_.identity, util.makeErrorHandler('Emit Filter'));

    })
    .subscribe(_.identity, util.makeErrorHandler('Read Filters'));
}

function init(socket, marquee, poi) {
    debug('Initializing histogram brush');

    // Grab global stats at initialization
    var globalStats = new Rx.ReplaySubject(1);
    var filterSubject = new Rx.ReplaySubject(1);
    var attributeChange = new Rx.Subject();
    var updateAttributeSubject = new Rx.Subject();

    //////////////////////////////////////////////////////////////////////////
    // Backbone views and models
    //////////////////////////////////////////////////////////////////////////
    // TODO: Get declaration and initialization closer.
    var allHistogramsView;
    var histograms;
    var HistogramModel;

    //////////////////////////////////////////////////////////////////////////
    // Setup Streams
    //////////////////////////////////////////////////////////////////////////

    // Setup filtering
    setupSendHistogramFilters(filterSubject, socket, poi);

    // Setup update attribute subject that histogram panel can write to
    updateAttributeSubject.do(function (data){
        updateAttribute(data.oldAttr, data.newAttr, data.type);
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

        var panel = histogramPanel.initHistograms(data, attributes, filterSubject, attributeChange, updateAttributeSubject);
        allHistogramsView = panel.view;
        histograms = panel.collection;
        HistogramModel = panel.model;

        var maxInitialItems = Math.min(Math.round((window.innerHeight - 110) / 85), 5);
        var filteredAttributes = {};
        var firstKeys = _.first(_.keys(data.sparkLines), maxInitialItems);
        _.each(firstKeys, function (key) {
            filteredAttributes[key] = data.sparkLines[key];
            filteredAttributes[key].firstTime = true;
            filteredAttributes[key].sparkLines = true;
            updateAttribute(null, key, 'sparkLines');
        });
        updateHistogramData(histograms, filteredAttributes, data, HistogramModel, true);

    }).subscribe(globalStats, util.makeErrorHandler('Global stat aggregate call'));


    // Take stream of selections and drags and use them for histograms
    marquee.selections.map(function (val) {
        return {type: 'selection', sel: val};
    }).merge(marquee.drags.throttleFirst(DRAG_SAMPLE_INTERVAL).map(function (val) {
            return {type: 'drag', sel: val};
        })
    ).merge(attributeChange.map(function () {
            return {type: 'attributeChange', sel: lastSelection};
        })
    ).flatMapLatest(function (selContainer) {
        return globalStats.map(function (globalVal) {
            return {type: selContainer.type, sel: selContainer.sel, globalStats: globalVal};
        });

    }).flatMapLatest(function (data) {
        var binning = {};
        var attributeNames = _.pluck(activeAttributes, 'name');
        _.each(activeAttributes, function (attr) {
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


function checkReply (reply) {
    if (!reply) {
        console.error('Unexpected server error on global aggregate');
    } else if (reply && !reply.success) {
        console.error('Server replied with error from global aggregate:', reply.error, reply.stack);
    }
}

function updateHistogramData (collection, data, globalStats, Model, empty) {
    var histograms = [];
    _.each(data, function (val, key) {
        var histogram = new Model();
        var params = {
            data: empty ? {} : val,
            globalStats: globalStats,
            timeStamp: Date.now(),
            firstTime: false
        };

        if (val.firstTime) {
            params.firstTime = true;
        }

        if (val.sparkLines !== undefined) {
            params.sparkLines = val.sparkLines;
        }

        histogram.set(params);
        histogram.id = key;
        histogram.set('attribute', key);
        histograms.push(histogram);

    });
    collection.set(histograms);
}


//socket * ?? -> Observable ??
function aggregatePointsAndEdges (socket, params) {
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

'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:histogramBrush');
var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');
var _       = require('underscore');
var Handlebars = require('handlebars');
var Backbone = require('backbone');
    Backbone.$ = $;
var d3 = require('d3');

var histogramPanel = require('./histogramPanel');
var util    = require('./util.js');


//////////////////////////////////////////////////////////////////////////////
// CONSTANTS
//////////////////////////////////////////////////////////////////////////////

// var MODE = 'countBy';
var MODE = 'default';
// var DIST = false;
var DRAG_SAMPLE_INTERVAL = 200;
// var BAR_THICKNESS = 16;
// var SPARKLINE_HEIGHT = 50;
var NUM_SPARKLINES = 30;
// var NUM_COUNTBY_SPARKLINES = NUM_SPARKLINES - 1;
// var NUM_COUNTBY_HISTOGRAM = NUM_COUNTBY_SPARKLINES;

// //////////////////////////////////////////////////////////////////////////////
// // Globals for updates
// //////////////////////////////////////////////////////////////////////////////

// // // TODO: Pull these into the created histogram object, away from globals.
// var color = d3.scale.ordinal()
//         .range(['#0FA5C5', '#929292', '#0FA5C5', '#00BBFF'])
//         .domain(['local', 'global', 'globalSmaller', 'localBigger']);

// var colorUnselected = d3.scale.ordinal()
//         .range(['#96D8E6', '#C8C8C8', '#0FA5C5', '#00BBFF'])
//         .domain(['local', 'global', 'globalSmaller', 'localBigger']);

// var colorHighlighted = d3.scale.ordinal()
//         .range(['#E35E13', '#6B6868', '#E35E13', '#FF3000'])
//         .domain(['local', 'global', 'globalSmaller', 'localBigger']);

// var margin = {top: 10, right: 70, bottom: 20, left:20};
// var marginSparklines = {top: 10, right: 20, bottom: 10, left: 20};
var lastSelection;
// var attributes = [];
var activeAttributes = [];
var attributeChange = new Rx.Subject();
// var globalStatsCache = {}; // For add histogram. TODO: Get rid of this and use replay
// var d3DataMap = {};
// var histogramFilters = {};
// var globalSocket;
// var globalPoi;


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
    // globalSocket = socket;
    // globalPoi = poi;


    //////////////////////////////////////////////////////////////////////////
    // Backbone views and models
    //////////////////////////////////////////////////////////////////////////
    var allHistogramsView;
    var histograms;
    var HistogramModel;

    //////////////////////////////////////////////////////////////////////////
    // Setup Streams
    //////////////////////////////////////////////////////////////////////////

    setupSendHistogramFilters(filterSubject, socket, poi);

    updateAttributeSubject.do(function (data){
        updateAttribute(data.oldAttr, data.newAttr, data.type);
    }).subscribe(_.identity, util.makeErrorHandler('Update Attribute'));


    var globalStream = aggregatePointsAndEdges(socket,
        {all: true, mode: MODE});
    var globalStreamSparklines = aggregatePointsAndEdges(socket,
        {all: true, mode: MODE, binning: {'_goalNumberOfBins': NUM_SPARKLINES}});

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

        var params = {sel: data.sel, attributes: attributes, binning: binning, mode: MODE};
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

        // TODO: Figure out if we need to treat these separately or not
        if (data.type === 'selection' || data.type === 'attributeChange') {
            updateHistogramData(socket, marquee, histograms, data.reply.data, data.globalStats, HistogramModel);
        } else if (data.type === 'drag') {
            updateHistogramData(socket, marquee, histograms, data.reply.data, data.globalStats, HistogramModel);
        }

        // TODO: Pull this out from here.
        //do after updates because may trigger prepopulation
        allHistogramsView.render();

    }).subscribe(_.identity, util.makeErrorHandler('Brush selection aggregate error'));
}


function checkReply (reply) {
    if (!reply) {
        console.error('Unexpected server error on global aggregate');
    } else if (reply && !reply.success) {
        console.error('Server replied with error from global aggregate:', reply.error, reply.stack);
    }
}

function updateHistogramData (socket, marquee, collection, data, globalStats, Model) {
    var histograms = [];
    _.each(data, function (val, key) {
        var histogram = new Model();
        histogram.set({data: val, globalStats: globalStats, firstTime: false, timeStamp: Date.now()});
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

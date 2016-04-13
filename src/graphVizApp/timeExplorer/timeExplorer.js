'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:TimeExplorer');
var $       = window.$;
var Rx      = require('rxjs/Rx.KitchenSink');
              require('../../rx-jquery-stub');
var _       = require('underscore');
var Handlebars = require('handlebars');
var Backbone = require('backbone');
    Backbone.$ = $;

var d3 = require('d3');
var Command = require('../command.js');
var util    = require('../util.js');
var FilterControl = require('../FilterControl.js');
var Identifier = require('../Identifier');
var contentFormatter = require('../contentFormatter.js');

var TimeExplorerPanel = require('./TimeExplorerPanel.js');
var timeExplorerUtils = require('./timeExplorerUtils.js');

//////////////////////////////////////////////////////////////////////////////
// CONSTANTS
//////////////////////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////////////////////
// Explorer / Data Management
//////////////////////////////////////////////////////////////////////////////

function TimeExplorer (socket, $div, filtersPanel) {
    var that = this;
    this.$div = $div;
    this.socket = socket;
    this.filtersPanel = filtersPanel;

    this.getTimeDataCommand = new Command('getting time data', 'timeAggregation', socket);
    this.getTimeBoundsCommand = new Command('getting time bounds', 'getTimeBoundaries', socket);
    this.namespaceMetadataCommand = new Command('getting namespace metadata', 'get_namespace_metadata', socket);

    this.activeQueries = [];
    this.timeDescription = {
        timeType: null,
        timeAttr: null,
        timeAggregation: timeExplorerUtils.DEFAULT_TIME_AGGREGATION,
        start: null,
        stop: null
    };
    this.zoomCount = 0;

    this.queryChangeSubject = new Rx.ReplaySubject(1);
    this.zoomRequests = new Rx.ReplaySubject(1);
    this.graphTimeFilter = null;


    this.queryChangeSubject.filter(function (timeDesc) {
            return (timeDesc.timeType && timeDesc.timeAttr);
        }).distinctUntilChanged(function (timeDesc) {
            return timeDesc.timeType + timeDesc.timeAttr;
        }).flatMap(function (timeDesc) {
            // console.log('GETTING TIME BOUNDS');
            return that.getTimeBoundsCommand.sendWithObservableResult(timeDesc);
        }).do(function (resp) {
            // console.log('GOT TIME BOUNDS');

            that.originalStart = resp.min;
            that.originalStop = resp.max;

            that.modifyTimeDescription({
                start: resp.min,
                stop: resp.max
            });
        }).subscribe(_.identity, util.makeErrorHandler('getting time bounds'));


    this.queryChangeSubject.filter(function (desc) {
            // Not initialized
            return !(_.contains(_.values(desc), null));
        }).flatMap(function (timeDesc) {
            // console.log('WE GETTING TIME DATA');
            var timeType = timeDesc.timeType;
            var timeAttr = timeDesc.timeAttr;
            var timeAggregation = timeDesc.timeAggregation;
            var start = timeDesc.start;
            var stop = timeDesc.stop;
            return that.getMultipleTimeData(timeType, timeAttr, start, stop, timeAggregation, that.activeQueries);
        }).do(function (data) {
            // debug('GOT NEW DATA: ', data);
            var dividedData = {};
            dividedData.all = data.All;
            delete data.All;
            dividedData.user = data;
            dividedData.maxBinValue = dividedData.all.maxBin;

            // debug('DIVIDED DATA: ', dividedData);

            that.panel.model.set(dividedData);
        }).subscribe(_.identity, util.makeErrorHandler('Error getting time data stream'));


    this.queryChangeSubject.onNext(this.timeDescription);
    this.setupZoom();

    // Get data necessary to render timeExplorerPanel
    this.namespaceMetadataCommand.sendWithObservableResult().do((metadata) => {
        this.panel = new TimeExplorerPanel(socket, $div, metadata.metadata, this);
    }).subscribe(_.identity, util.makeErrorHandler('Error grabbing metadata for time explorer'));


    debug('Initialized Time Explorer');
}

TimeExplorer.prototype.updateGraphTimeFilter = function (newTimeFilter) {
    var that = this;

    var filtersCollection = that.filtersPanel.collection;
    var filterModel = filtersCollection.findWhere({
        controlType: 'timeExplorer'
    });

    if (newTimeFilter) {

        var combinedAttr = '' + Identifier.clarifyWithPrefixSegment(this.timeDescription.timeAttr, this.timeDescription.timeType);
        var timeFilterQuery = combinedAttr + ' >= ' + newTimeFilter.start + ' AND ' + combinedAttr + ' <= ' + newTimeFilter.stop;

        var query = that.makeQuery(this.timeDescription.timeType, this.timeDescription.timeAttr, timeFilterQuery).query;

        if (filterModel === undefined) {
            // Make new
            filtersCollection.addFilter({
                attribute: this.timeDescription.timeAttr,
                dataType: 'number', // TODO: make this a date type
                controlType: 'timeExplorer',
                query: query
            });

        } else {
            // Update
            filterModel.set('query', query);
        }

    } else {
        // Delete
        filtersCollection.remove(filterModel);
    }

};

TimeExplorer.prototype.modifyTimeDescription = function (change) {
    var that = this;
    that.queryChangeSubject.take(1).do(function (timeDesc) {
        _.extend(timeDesc, change);
        // debug('NEW TIME DESC: ', timeDesc);
        that.queryChangeSubject.onNext(timeDesc);
    }).subscribe(_.identity);
};

TimeExplorer.prototype.addActiveQuery = function (type, attr, string) {
    var formattedQuery = this.makeQuery(type, attr, string);
    this.activeQueries.push({
        name: string,
        query: formattedQuery
    });
    this.modifyTimeDescription({}); // Update. TODO: Make an actual update func
};

TimeExplorer.prototype.makeQuery = function (type, attr, string) {
    return {
        type: type,
        attribute: attr,
        query: FilterControl.prototype.queryFromExpressionString(string)
    };
};

TimeExplorer.prototype.getTimeData = function (timeType, timeAttr, start, stop, timeAggregation, otherFilters, name) {
    // FOR UberAll
    // LARGEST      2007-01-07T23:59:24+00:00
    // SMALLEST     2007-01-01T00:01:24+00:00
    // timeExplorer.realGetTimeData('point', 'time', '2007-01-01T00:01:24+00:00', '2007-01-07T23:59:24+00:00', 'day', [])
    // timeExplorer.realGetTimeData('point', 'time', '2007-01-01T00:01:24+00:00', '2007-01-07T23:59:24+00:00', 'day', [timeExplorer.makeQuery('point', 'trip', 'point:trip > 5000')])

    // console.log('GET TIME DATA');

    var combinedAttr = '' + Identifier.clarifyWithPrefixSegment(timeAttr, timeType);
    var timeFilterQuery = combinedAttr + ' >= ' + start + ' AND ' + combinedAttr + ' <= ' + stop;

    var timeFilter = {
        type: timeType,
        attribute: timeAttr,
        query: FilterControl.prototype.queryFromExpressionString(timeFilterQuery)
    };

    var filters = otherFilters.concat([timeFilter]);

    var payload = {
        start: start,
        stop: stop,
        timeType: timeType,
        timeAttr: timeAttr,
        timeAggregation: timeAggregation,
        filters: filters
    };

    // console.log('SENDING TIME DATA COMMAND');

    return this.getTimeDataCommand.sendWithObservableResult(payload)
        .map(function (resp) {
            // console.log('payload: ', payload);
            resp.data.name = name;
            return resp.data;
        });
};


TimeExplorer.prototype.getMultipleTimeData = function (timeType, timeAttr, start, stop, timeAggregation, activeQueries) {
    var that = this;
    var subjects = _.map(activeQueries, function (queryWrapper) {
        return that.getTimeData(timeType, timeAttr, start, stop, timeAggregation, [queryWrapper.query], queryWrapper.name);
    });

    var allSubject = that.getTimeData(timeType, timeAttr, start, stop, timeAggregation, [], 'All');
    subjects.push(allSubject);

    var zipFunc = function () {
        // debug('zipping');
        var ret = {};
        for (var i = 0; i < arguments.length; i++) {
            var obj = arguments[i];
            ret[obj.name] = obj;
        }
        // console.log('RET: ', ret);
        return ret;
    };

    subjects.push(zipFunc);

    return Rx.Observable.zip.apply(Rx.Observable, subjects);

    // return Rx.Observable.zip(subjects, zipFunc);
};

TimeExplorer.prototype.zoomTimeRange = function (zoomFactor, percentage, dragBox, vizContainer) {
    // console.log('GOT ZOOM TIME REQUEST: ', arguments);
    // Negative if zoom out, positive if zoom in.


    // HACK UNTIL FIGURE OUT BACKPRESS IN RX5
    this.zoomCount++;

    var adjustedZoom = 1.0 - zoomFactor;

    // console.log('zoomReq: ', adjustedZoom);

    var params = {
        percentage: percentage,
        zoom: adjustedZoom,
        dragBox: dragBox,
        vizContainer: vizContainer
    };

    this.zoomRequests.onNext(params);
};

TimeExplorer.prototype.setupZoom = function () {
    var that = this;
    this.zoomRequests
    .inspectTime(timeExplorerUtils.ZOOM_POLL_RATE)
    .flatMap(function (request) {
        return that.queryChangeSubject
            .take(1)
            .map(function (desc) {
                return {request: request, timeDesc: desc};
            });
    }).do(function (data) {
        var req = data.request;
        var desc = data.timeDesc;

        // var total = req.numLeft + req.numRight + 1;
        var numStart = (new Date(desc.start)).getTime();
        var numStop = (new Date(desc.stop)).getTime();

        var newStart = numStart;
        var newStop = numStop;

        // console.log('numStart, numStop: ', numStart, numStop);

        for (var i = 0; i < that.zoomCount; i++) {
            var diff = newStop - newStart;

            var leftRatio = req.percentage;// (req.numLeft/total) || 1; // Prevents breaking on single bin
            var rightRatio = 1 - req.percentage;// (req.numRight/total) || 1;

            // Scale diff based on how many zoom requests
            // minus raw = in, so pos diff or delta

            // Deltas are represented as zoom in, so change towards a smaller window
            var startDelta = leftRatio * diff * req.zoom;
            var stopDelta = rightRatio * diff * req.zoom;

            newStart += Math.round(startDelta);
            newStop -= Math.round(stopDelta);

        }
        that.zoomCount = 0;

        // Guard against stop < start
        if (newStart >= newStop) {
            newStart = newStop - 1;
        }

        // console.log('New Start, Stop: ', newStartDate, newStopDate);

        that.modifyTimeDescription({
            start: newStart,
            stop: newStop
        });

    }).subscribe(_.identity, util.makeErrorHandler('zoom request handler'));

};


module.exports = TimeExplorer;

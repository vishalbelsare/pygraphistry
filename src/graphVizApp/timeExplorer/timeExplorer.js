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

// TODO: Use proper IDs
var lastId = 0;
function getId () {
    return lastId++;
}

function TimeExplorer (socket, $div, filtersPanel) {
    var that = this;
    this.$div = $div;
    this.socket = socket;
    this.filtersPanel = filtersPanel;

    this.zoomRequests = new Rx.ReplaySubject(1);
    this.zoomCount = 0;

    this.getTimeDataCommand = new Command('getting time data', 'timeAggregation', socket);
    this.getTimeBoundsCommand = new Command('getting time bounds', 'getTimeBoundaries', socket);
    this.namespaceMetadataCommand = new Command('getting namespace metadata', 'get_namespace_metadata', socket);
    this.updateEncodingCommand = new Command('updating encodings on server', 'encode_by_column', socket);

    this.dataModelSubject = new Rx.ReplaySubject(1);
    this.dataModelSubject.onNext(timeExplorerUtils.baseDataModel);
    this.dataModelDiffer = timeExplorerUtils.makeDataModelDiffer();

    this.barModelSubjects = [];
    this.globalBarModelSubject = new Rx.ReplaySubject(1);
    this.globalBarModelSubject.onNext(timeExplorerUtils.baseGlobalBar);

    var allBar = new Rx.ReplaySubject(1);
    var allBarModel = _.clone(timeExplorerUtils.baseUserBar);
    allBarModel.showTimeAggregationButtons = true;
    allBarModel.id = getId();
    allBar.onNext(allBarModel);
    this.barModelSubjects.push(allBar);

    // When we change timeDesc/timeAgg, update global bounds
    this.dataModelSubject.do((newModel) => {
        // Handle various updates
        var changedKeys = this.dataModelDiffer(newModel);

        // handles time attribute changes
        if (_.intersection(changedKeys, ['timeAttr', 'timeType']).length > 0) {
            // update global bounds
            this.updateGlobalTimeBounds(newModel);
        }

        if (_.intersection(changedKeys, ['filterTimeBounds']).length > 0) {
            // Update filters on rest of graph
            this.updateGraphTimeFilter(newModel);
        }

        if (_.intersection(changedKeys, ['encodingBoundsA', 'encodingBoundsB', 'encodingBoundsC']).length > 0) {
            // Update encodings on server
            this.updateEncodings(newModel);
        }

    }).subscribe(_.identity, util.makeErrorHandler('updating time data model'));

    this.setupZoom();

    // Get data necessary to render timeExplorerPanel
    this.namespaceMetadataCommand.sendWithObservableResult().do((metadata) => {
        this.panel = new TimeExplorerPanel(socket, $div, metadata.metadata, this);
    }).subscribe(_.identity, util.makeErrorHandler('Error grabbing metadata for time explorer'));

    debug('Initialized Time Explorer');
}


TimeExplorer.prototype.updateEncodings = function (model) {

    var {encodingBoundsA, encodingBoundsB, encodingBoundsC} = model;
    var query = {};
    query.type = model.timeType;
    query.attribute = model.timeAttr;

    // Guard on having types set
    // TODO: Rework this logic
    if (query.type === null || query.attribute === null) {
        return;
    }

    query.encodingType = 'color';
    query.timeBounds = {
        encodingBoundsA,
        encodingBoundsB,
        encodingBoundsC
    };

    // Check if needs to reset
    var shouldReset = encodingBoundsA.start === null && encodingBoundsA.stop === null &&
            encodingBoundsB.start === null && encodingBoundsB.stop === null &&
            encodingBoundsC.start === null && encodingBoundsC.stop === null;

    query.reset = shouldReset;

    this.updateEncodingCommand.sendWithObservableResult(query)
        .subscribe(_.identity, util.makeErrorHandler('updating encodings'));
};


TimeExplorer.prototype.updateGlobalTimeBounds = function (model) {
    var obj = {
        timeAttr: model.timeAttr,
        timeType: model.timeType
    };

    // TODO FIXME
    // Guard on initialized
    if (!obj.timeAttr || !obj.timeType) {
        return;
    }

    this.getTimeBoundsCommand.sendWithObservableResult(obj)
        .do((timeBounds) => {
            var {min, max} = timeBounds;
            var newModel = _.clone(model);
            newModel.globalTimeBounds = {start: min, stop: max};

            // Set local time bounds if they don't exist
            // TODO: Deal with this more naturally / separately
            if (newModel.localTimeBounds.start === null || newModel.localTimeBounds.stop === null) {
                newModel.localTimeBounds = {start: min, stop: max};
            }

            this.dataModelSubject.onNext(newModel);
        }).subscribe(_.identity, util.makeErrorHandler('Error grabbing global time bounds'));
};


TimeExplorer.prototype.updateGraphTimeFilter = function (model) {

    var filtersCollection = this.filtersPanel.collection;
    var filterModel = filtersCollection.findWhere({
        controlType: 'timeExplorer'
    });

    if (model.filterTimeBounds && model.filterTimeBounds.start && model.filterTimeBounds.stop) {

        var combinedAttr = '' + Identifier.clarifyWithPrefixSegment(model.timeAttr, model.timeType);
        var timeFilterQuery = combinedAttr + ' >= ' + model.filterTimeBounds.start + ' AND ' + combinedAttr + ' <= ' + model.filterTimeBounds.stop;

        var query = this.makeQuery(model.timeType, model.timeAttr, timeFilterQuery).query;

        if (filterModel === undefined) {
            // Make new
            filtersCollection.addFilter({
                attribute: model.timeAttr,
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

TimeExplorer.prototype.removeActiveQuery = function (barModelSubject) {
    // Delete from bar model subjects list
    for (let i = 0; i < this.barModelSubjects.length; i++) {
        if (this.barModelSubjects[i] === barModelSubject) {
            this.barModelSubjects.splice(i, 1);
            break;
        }
    }

    this.panel.view.updateChildrenViewList();
}

TimeExplorer.prototype.addActiveQuery = function (type, attr, string) {

    var newBar = new Rx.ReplaySubject(1);
    var newBarModel = _.clone(timeExplorerUtils.baseUserBar);

    newBarModel.id = getId();
    newBarModel.filter = this.makeQuery(type, attr, string);

    newBar.onNext(newBarModel);
    this.barModelSubjects.push(newBar);
    this.panel.view.updateChildrenViewList();
};

TimeExplorer.prototype.makeQuery = function (type, attr, string) {
    return {
        type: type,
        attribute: attr,
        query: FilterControl.prototype.queryFromExpressionString(string)
    };
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
    // Negative if zoom out, positive if zoom in.


    // HACK UNTIL FIGURE OUT BACKPRESS IN RX5
    this.zoomCount++;

    var adjustedZoom = 1.0 - zoomFactor;

    var params = {
        percentage: percentage,
        zoom: adjustedZoom,
        dragBox: dragBox,
        vizContainer: vizContainer
    };

    this.zoomRequests.onNext(params);
};

TimeExplorer.prototype.setupZoom = function () {

    this.zoomRequests
        .inspectTime(timeExplorerUtils.ZOOM_POLL_RATE)
        .flatMap((request) => {
            return this.dataModelSubject
                .take(1)
                .map(function (model) {
                    return {request, model};
                });
        }).do((data) => {
            var {request, model} = data;

            // var total = req.numLeft + req.numRight + 1;
            var numStart = (new Date(model.localTimeBounds.start)).getTime();
            var numStop = (new Date(model.localTimeBounds.stop)).getTime();

            var newStart = numStart;
            var newStop = numStop;

            for (var i = 0; i < this.zoomCount; i++) {
                var diff = newStop - newStart;

                var leftRatio = request.percentage;// (req.numLeft/total) || 1; // Prevents breaking on single bin
                var rightRatio = 1 - request.percentage;// (req.numRight/total) || 1;

                // Scale diff based on how many zoom requests
                // minus raw = in, so pos diff or delta

                // Deltas are represented as zoom in, so change towards a smaller window
                var startDelta = leftRatio * diff * request.zoom;
                var stopDelta = rightRatio * diff * request.zoom;

                newStart += Math.round(startDelta);
                newStop -= Math.round(stopDelta);

            }

            this.zoomCount = 0;

            // Guard against stop < start
            if (newStart >= newStop) {
                newStart = newStop - 1;
            }

            var newModel = _.clone(model);
            newModel.localTimeBounds = {
                start: newStart,
                stop: newStop
            };

            this.dataModelSubject.onNext(newModel);

        }).subscribe(_.identity, util.makeErrorHandler('zoom request handler'));

};


module.exports = TimeExplorer;

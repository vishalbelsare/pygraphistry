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

var timeBar = require('./timeBar.js');
var timeExplorerUtils = require('./timeExplorerUtils.js');


//////////////////////////////////////////////////////////////////////////////
// CONSTANTS
//////////////////////////////////////////////////////////////////////////////

var AXIS_HEIGHT = 20;
var DOUBLE_CLICK_TIME = 500;

// var ZOOM_UPDATE_RATE = 1500;
var SCROLL_SAMPLE_TIME = 5;
//var SCROLLS_PER_ZOOM = Math.floor(ZOOM_UPDATE_RATE / SCROLL_SAMPLE_TIME);

var DEFAULT_TIME_AGGREGATION = 'day';

var axisMargin = {
    top: 1,
    right: 10,
    bottom: 10,
    left: 10
};


var INTERACTION_MODE = 'FILTER';



var TimeExplorerModel = Backbone.Model.extend({});
var UserBarsModel = Backbone.Model.extend({});
var BottomAxisModel = Backbone.Model.extend({});
var TimeBarCollection = Backbone.Collection.extend({
    model: timeBar.model,
    comparator: 'position'
});



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

    this.activeQueries = [];
    this.timeDescription = {
        timeType: null,
        timeAttr: null,
        timeAggregation: DEFAULT_TIME_AGGREGATION,
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

    this.panel = new TimeExplorerPanel(socket, $div, this);


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



//////////////////////////////////////////////////////////////////////////////
// Explorer Panel
//////////////////////////////////////////////////////////////////////////////


var BottomAxisView = Backbone.View.extend({
    tagName: 'div',
    className: 'bottomAxisDiv',

    events: {},

    initialize: function () {
        this.listenTo(this.model, 'destroy', this.remove);
        this.listenTo(this.model, 'change:key', this.render);

        var params = {};
        this.template = Handlebars.compile($('#timeBarBottomAxisTemplate').html());
        var html = this.template(params);
        this.$el.html(html);
        this.$el.attr('cid', this.cid);
    },

    render: function () {
        var model = this.model;

        if (model.get('initialized')) {
            updateBottomAxis(model.get('axisContainer'), model);
            return this;
        }

        model.set('$el', this.$el);
        var axisContainer = this.$el.children('.axisContainer');
        axisContainer.empty();
        model.set('axisContainer', axisContainer);
        var axisHeight = '' + AXIS_HEIGHT + 'px';
        axisContainer.height(axisHeight);
        initializeBottomAxis(axisContainer, model);
        updateBottomAxis(axisContainer, model);

        model.set('initialized', true);
        return this;
    }
});

var MainBarView = Backbone.View.extend({

});

var UserBarsView = Backbone.View.extend({
    events: {
        'click #newAttrSubmitButton': 'submitNewAttr'
    },

    initialize: function () {

        this.$el = $('#timeExplorerBody');
        this.el = this.$el[0];

        this.listenTo(this.collection, 'add', this.addBar);
        this.listenTo(this.collection, 'remove', this.removeBar);
        this.listenTo(this.collection, 'reset', this.addAll);

        this.template = Handlebars.compile($('#timeExplorerBodyTemplate').html());

        this.render();
    },

    render: function () {
        // this.collection.sort(); //TODO

        var newDiv = $('<div id="timeExplorerUserBarsRenderingContainer"></div>');

        // We empty out the div and reattach so that we can resort the elements without
        // having to rerender the svgs inside.
        this.$el.empty();
        this.$el.append(newDiv);

        this.collection.each(function (child) {
            // TODO: This guard is a hack. I don't know how to initialize backbone
            if (child.view) {
                newDiv.append(child.view.el);
                child.view.render();

            }
        });

        var params = {

        };
        var addRowHtml = this.template(params);
        newDiv.append(addRowHtml);

        this.$el.attr('cid', this.cid);
    },

    submitNewAttr: function (evt) {
        evt.preventDefault();
        var newType = $('#newType').val();
        var newAttr = $('#newAttr').val();
        var newQuery = $('#newQuery').val();
        // TODO: Don't use this global. Instead properly structure user bars as a model, that contains a collection.
        var explorer = this.model.get('explorer');
        explorer.addActiveQuery(newType, newAttr, newQuery);
        // this.collection.get('explorer').addActiveQuery(newType, newAttr, newQuery);
    },

    addBar: function (model) {
        var view = new timeBar.view({model: model});
        model.view = view;
        // this.$el.append(view.el);
        // view.render();
        this.render();
    },

    removeBar: function () {
        //TODO
        console.log('ATTEMPTING TO REMOVE USER BAR, NOT IMPLEMENTED YET');
    },

    addAll: function () {
        // this.$el.empty();
        this.collection.each(this.addBar, this);
        this.render();
    },

    mousemoveParent: function (evt) {
        this.collection.each(function (child) {
            if (child.view) {
                child.view.mousemoveParent(evt);
            }
        });
    },

    mouseoutParent: function (evt) {
        this.collection.each(function (child) {
            if (child.view) {
                child.view.mouseoutParent(evt);
            }
        });
    }
});

var SideInputView = Backbone.View.extend({
    el: $('#timeExplorerSideInput'),
    events: {
        'click #timeAttrSubmitButton': 'submitTimeAttr',
        'click #newAttrSubmitButton': 'submitNewAttr',
        'change #timeAggregationSelect': 'submitTimeAggregation'
    },

    initialize: function () {
        this.listenTo(this.model, 'destroy', this.remove);

        var params = {
            timeAggregationOptions: ['day', 'hour', 'minute', 'second']
        };
        this.template = Handlebars.compile($('#timeExplorerSideInputTemplate').html());
        var html = this.template(params);
        this.$el.html(html);
        this.$el.attr('cid', this.cid);
        // this.setSelectedTimeAggregation();
    },

    render: function () {

    },

    submitTimeAttr: function (evt) {
        evt.preventDefault();
        var timeType = $('#timeType').val();
        var timeAttr = $('#timeAttr').val();
        this.model.get('explorer').modifyTimeDescription({
            timeType: timeType,
            timeAttr: timeAttr
        });
    },

    submitNewAttr: function (evt) {
        evt.preventDefault();
        var newType = $('#newType').val();
        var newAttr = $('#newAttr').val();
        var newQuery = $('#newQuery').val();
        this.model.get('explorer').addActiveQuery(newType, newAttr, newQuery);
    },

    submitTimeAggregation: function (evt) {
        evt.preventDefault();
        this.setSelectedTimeAggregation();
    },

    setSelectedTimeAggregation: function () {
        var timeAggregation = $('#timeAggregationSelect').val();
        this.model.get('explorer').modifyTimeDescription({
            timeAggregation: timeAggregation
        });
    }
});


function TimeExplorerPanel (socket, $parent, explorer) {
    var that = this;

    this.userBars = new TimeBarCollection({explorer: explorer});

    // var SideInputModel = Backbone.Model.extend({});
    // this.sideInputView = new SideInputView({model: new SideInputModel({explorer: explorer})});

    var userBarsModel = new UserBarsModel({explorer: explorer});
    this.userBarsView = new UserBarsView({explorer: explorer, collection: this.userBars, model: userBarsModel});
    var mainBarModel = new timeBar.model({explorer: explorer, timeStamp: Date.now(), showTimeAggregationButtons: true});
    this.mainBarView = new timeBar.view({model: mainBarModel});
    this.bottomAxisView = new BottomAxisView({model: new BottomAxisModel({explorer: explorer}) });

    var TimeExplorerView = Backbone.View.extend({
        el: $parent,
        $timeExplorerBody: $('#timeExplorerBody'),
        $timeExplorerTop: $('#timeExplorerTop'),
        $timeExplorerMain: $('#timeExplorerMain'),
        $timeExplorerBottom: $('#timeExplorerBottom'),
        $timeExplorerAxisContainer: $('#timeExplorerAxisContainer'),
        $timeExplorerVizContainer: $('#timeExplorerVizContainer'),
        $timeExplorerSideInput: $('#timeExplorerSideInput'),
        $dragBox: $('#timeExplorerDragBox'),
        $verticalLine: $('#timeExplorerVerticalLine'),
        userBarsView: that.userBarsView,
        mainBarView: that.mainBarView,
        bottomAxisView: that.bottomAxisView,
        // sideInputView: that.sideInputView,

        timeBarInitializationMenuTemplate: Handlebars.compile($('#timeBarInitializationMenuTemplate').html()),

        events: {
            'mousemove #timeExplorerVizContainer': 'mousemove',
            'mouseout #timeExplorerVizContainer': 'mouseout',
            'mousedown #timeExplorerVizContainer': 'handleMouseDown',
            'click #timeAttrSubmitButton': 'submitTimeAttr'
        },

        initialize: function () {
            // TODO: Add, remove, reset handlers
            this.listenTo(this.model, 'change', this.updateChildren);
            this.listenTo(this.model, 'change:all', this.setupMouseInteractions);

            this.dragBoxLastLeftX = Infinity;
            this.dragBoxLastRightX = -Infinity;


            // this.setupVerticalLine();
            this.renderInitializationMenu();
        },

        renderInitializationMenu: function () {
            this.userBarsView.$el.addClass('hidden');
            var params = {};
            var html = this.timeBarInitializationMenuTemplate(params);
            this.$timeExplorerMain.append(html);
        },

        submitTimeAttr: function (evt) {
            evt.preventDefault();
            var timeType = $('#timeType').val();
            var timeAttr = $('#timeAttr').val();

            this.render();

            this.model.get('explorer').modifyTimeDescription({
                timeType: timeType,
                timeAttr: timeAttr
            });
        },

        render: function () {
            // TODO: New div and render correct eleements in right order
            this.$timeExplorerMain.empty();

            // console.log('RENDERING TOP LEVEL VIEW');
            this.$timeExplorerMain.append(this.mainBarView.el);
            this.$timeExplorerAxisContainer.append(this.bottomAxisView.el);

            this.userBarsView.$el.removeClass('hidden');
        },

        setupMouseInteractions: function () {
            // TODO: Figure out how to make this not fire everytime changes occur,
            // but only when data is first added
            if (!this.enableMouseInteractions) {
                this.setupVerticalLine();
                this.setupZoomInteraction();
                this.enableMouseInteractions = true;
            }
        },

        setupZoomInteraction: function () {
            var that = this;
            var zoomBase = 1.03;

            this.$timeExplorerVizContainer.onAsObservable('mousewheel')
                // TODO Replace this with correct Rx5 handler.
                .inspectTime(SCROLL_SAMPLE_TIME)
                .do(function (wheelEvent) {
                    wheelEvent.preventDefault();
                })
                .do(function(wheelEvent) {

                    // DONT ZOOM IF DRAG BOX IS VISIBLE
                    // TODO: Enable zooming and rescale box
                    if (that.$dragBox.css('display') !== 'none') {
                        return;
                    }

                    var zoomFactor = (wheelEvent.deltaY < 0 ? zoomBase : 1.0 / zoomBase) || 1.0;

                    var xPos = wheelEvent.pageX;
                    var percentage = that.mainBarView.getPercentageForPosition(xPos);

                    var explorer = that.model.get('explorer');
                    explorer.zoomTimeRange(zoomFactor, percentage, that.$dragBox);

                }).subscribe(_.identity, util.makeErrorHandler('zoom handle on time explorer'));


        },

        handleMouseDown: function (evt) {
            // Return early if it's a UI element
            // TODO: Figure out how to represent this in terms of the selector
            var $target = $(evt.target);
            if ($target.hasClass('btn') || $target.hasClass('form-control')) {
                return;
            }

            var that = this;
            var explorer = that.model.get('explorer');

            if (!this.enableMouseInteractions) {
                return;
            }

            // In the middle of prior click/double click. Don't start new one.
            if (that.handlingMouseDown) {
                return;
            }
            that.handlingMouseDown = true;


            if (INTERACTION_MODE === 'ZOOM') {
                var startX = evt.pageX;
                var leftX = evt.pageX;
                var rightX = evt.pageX;
                var mouseMoved = false;

                var positionChanges = Rx.Observable.fromEvent(that.$timeExplorerVizContainer, 'mousemove')
                    .map(function (evt) {

                        mouseMoved = true;
                        var newX = evt.pageX;
                        var ends = [startX, newX];
                        leftX = _.min(ends);
                        rightX = _.max(ends);

                        that.$dragBox.css('left', leftX);
                        that.$dragBox.css('width', rightX - leftX);
                        that.$dragBox.css('display', 'block');

                    }).subscribe(_.identity, util.makeErrorHandler('time explorer drag move'));

                Rx.Observable.fromEvent(this.$timeExplorerVizContainer, 'mouseup')
                    .take(1)
                    .do(function () {
                        positionChanges.dispose();

                        var filterDownFunc = function () {
                            var leftBin = that.mainBarView.getBinForPosition(leftX);
                            var rightBin = that.mainBarView.getBinForPosition(rightX);

                            var mainBarData = that.model.get('all');
                            var cutoffs = mainBarData.cutoffs;

                            var leftCutoff = cutoffs[leftBin];
                            var rightCutoff = cutoffs[rightBin + 1];

                            var explorer = that.model.get('explorer');
                            explorer.modifyTimeDescription({
                                start: leftCutoff,
                                stop: rightCutoff
                            });

                            that.handlingMouseDown = false;
                        };

                        var zoomOutFunc = function () {
                            var explorer = that.model.get('explorer');
                            explorer.modifyTimeDescription({
                                start: explorer.originalStart,
                                stop: explorer.originalStop
                            });

                            Rx.Observable.timer(DOUBLE_CLICK_TIME)
                                .take(1)
                                .do(function () {
                                    that.handlingMouseDown = false;
                                }).subscribe(_.identity);
                        };

                        if (leftX === rightX) {
                            // Click
                            // Wait for new click to zoom out, else zoom in
                            // TODO: Figure out how to do this in terms of user accessibility settings
                            // that the user specified on how long to wait between double click.
                            var mousedownStream = Rx.Observable.fromEvent(that.$timeExplorerVizContainer, 'mousedown');
                            var timer = Rx.Observable.timer(DOUBLE_CLICK_TIME);

                            timer.merge(mousedownStream)
                                .take(1)
                                .do(function (val) {
                                    if (val) {
                                        // Is mousedown event
                                        zoomOutFunc();
                                    } else {
                                        // Timed out, is click
                                        filterDownFunc();
                                    }
                                }).subscribe(_.identity, util.makeErrorHandler('time explorer double click'));

                        } else {
                            // Drag
                            filterDownFunc();
                        }

                        that.$dragBox.css('display', 'none');

                    }).subscribe(_.identity, util.makeErrorHandler('time explorer drag mouseup'));

            } else if (INTERACTION_MODE === 'FILTER') {

                var startX = evt.pageX;
                var startLeftX = that.dragBoxLastLeftX;
                var startRightX = that.dragBoxLastRightX;
                var leftX = evt.pageX;
                var rightX = evt.pageX;
                var mouseMoved = false;

                var clickedOnOldWindow = (startX >= that.dragBoxLastLeftX && startX <= that.dragBoxLastRightX);

                var positionChanges = Rx.Observable.fromEvent(that.$timeExplorerVizContainer, 'mousemove')
                    .map(function (evt) {

                        mouseMoved = true;
                        var newX = evt.pageX;

                        if (clickedOnOldWindow) {

                            var leftBound = that.$timeExplorerMain.offset().left + timeBar.margin.left;
                            var rightBound = that.$timeExplorerMain.offset().left + that.$timeExplorerMain.width() - timeBar.margin.right;
                            // Slight extra padding
                            leftBound += 2;
                            rightBound -= 5;

                            // Prevent delta from going off the border
                            var delta = newX - startX;
                            // check left
                            if (startLeftX + delta <= leftBound) {
                                delta = leftBound - startLeftX;
                            }
                            // check right
                            if (startRightX + delta >= rightBound) {
                                delta = rightBound - startRightX;
                            }

                            that.dragBoxLastLeftX = startLeftX + delta;
                            that.dragBoxLastRightX = startRightX + delta;

                            leftX = that.dragBoxLastLeftX;
                            rightX = that.dragBoxLastRightX;

                            that.$dragBox.css('left', leftX);
                            that.$dragBox.css('width', rightX - leftX);
                            that.$dragBox.css('display', 'block');

                        } else {
                            // Create new window
                            var ends = [startX, newX];
                            leftX = _.min(ends);
                            rightX = _.max(ends);

                            that.dragBoxLastRightX = rightX;
                            that.dragBoxLastLeftX = leftX;

                            that.$dragBox.css('left', leftX);
                            that.$dragBox.css('width', rightX - leftX);
                            that.$dragBox.css('display', 'block');

                        }
                    }).subscribe(_.identity, util.makeErrorHandler('time explorer drag move'));

                Rx.Observable.fromEvent(this.$timeExplorerVizContainer, 'mouseup')
                    .take(1)
                    .do(function () {
                        positionChanges.dispose();

                        var removeFilterFunc = function () {

                            that.dragBoxLastLeftX = Infinity;
                            that.dragBoxLastRightX = -Infinity;

                            explorer.updateGraphTimeFilter(null);
                            that.handlingMouseDown = false;
                            that.$dragBox.css('display', 'none');
                        };

                        var applyFilterFunc = function () {
                            var mainBarData = that.model.get('all');
                            var cutoffs = mainBarData.cutoffs;

                            var leftBin = that.mainBarView.getBinForPosition(leftX);
                            var rightBin = that.mainBarView.getBinForPosition(rightX);

                            // Guard edges
                            leftBin = Math.max(leftBin, 0);
                            rightBin = Math.min(rightBin, cutoffs.length - 2);

                            var leftCutoff = cutoffs[leftBin];
                            var rightCutoff = cutoffs[rightBin + 1];

                            explorer.updateGraphTimeFilter({
                                start: leftCutoff,
                                stop: rightCutoff
                            });

                            that.handlingMouseDown = false;
                        };

                        if (leftX === rightX) {
                            // Click
                            if (clickedOnOldWindow) {
                                removeFilterFunc();
                            } else {
                                that.handlingMouseDown = false;
                            }

                        } else {
                            // Drag
                            applyFilterFunc();
                        }

                    }).subscribe(_.identity, util.makeErrorHandler('time explorer drag mouseup'));


            }



        },

        setupVerticalLine: function () {
            var that = this;
            this.$timeExplorerVizContainer.on('mouseover', function (evt) {
                that.$verticalLine.css('display', 'block');
            });
            this.$timeExplorerVizContainer.on('mouseout', function (evt) {
                that.$verticalLine.css('display', 'none');
            });
            this.$timeExplorerVizContainer.on('mousemove', function (evt) {
                var x = evt.pageX - 1;
                that.$verticalLine.css('left', '' + x + 'px');
            });
        },

        mousemove: function (evt) {
            if (!this.enableMouseInteractions) {
                return;
            }
            this.mainBarView.mousemoveParent(evt);
            this.userBarsView.mousemoveParent(evt);
        },

        mouseout: function (evt) {
            if (!this.enableMouseInteractions) {
                return;
            }
            this.mainBarView.mouseoutParent(evt);
            this.userBarsView.mouseoutParent(evt);
        },

        updateChildren: function () {
            var data = this.model.attributes;
            var explorer = this.model.get('explorer');
            var params;

            // TODO: Make this a cleaner system
            var axisKey = '' + data.all.start + data.all.stop + data.all.timeAggregation;

            // Handle axis
            params = {
                data: data.all,
                timeStamp: Date.now(),
                key: axisKey
            };
            this.bottomAxisView.model.set(params);

            // Handle main bar, '_all'
            params = {
                data: data.all,
                maxBinValue: data.maxBinValue,
                timeStamp: Date.now(),
                showTimeAggregationButtons: true,
                lineUnchanged: false
            };
            this.mainBarView.model.id = params.data.name;
            this.mainBarView.model.set('barType', 'main');
            this.mainBarView.model.set(params);

            var barModels = [];
            var collection = this.userBarsView.collection;

            // console.log('DATA: User: ', data.user);
            // console.log('Collection: ', collection);


            var dataKeys = _.keys(data.user);
            var existingKeys = _.pluck(collection.models, 'id');

            var updatedKeys = _.intersection(dataKeys, existingKeys);
            var newKeys = _.difference(dataKeys, existingKeys);
            // var deletedKeys = _.difference(existingKeys, dataKeys);

            var barModels = [];

            // Handle updated keys
            _.each(updatedKeys, function (key) {
                var val = data.user[key];
                // console.log('Updating data for: ', key);

                var params = {
                    data: val,
                    maxBinValue: data.maxBinValue,
                    timeStamp: Date.now(),
                    lineUnchanged: false
                };

                var model = collection.get(key);
                model.set(params);
                model.set('barType', 'user');
                barModels.push(model);
            });

            //Add new data elements
            _.each(newKeys, function (key) {
                var val = data.user[key];
                var barModel = new timeBar.model({explorer: explorer});
                var params = {
                    data: val,
                    maxBinValue: data.maxBinValue,
                    timeStamp: Date.now(),
                    lineUnchanged: false
                };

                barModel.set(params);
                barModel.set('barType', 'user');
                barModel.id = key;
                barModels.push(barModel);
            });

            collection.set(barModels);
        }

    });

    this.model = new TimeExplorerModel({explorer: explorer});
    this.view = new TimeExplorerView({model: this.model});
    this.collection = this.userBars;

}


//////////////////////////////////////////////////////////////////////////////
// TIME BAR
//////////////////////////////////////////////////////////////////////////////



//////////////////////////////////////////////////////////////////////////////
// BOTTOM AXIS
//////////////////////////////////////////////////////////////////////////////


function initializeBottomAxis ($el, model) {
    // debug('init bottom axis');

    var width = $el.width();
    var height = $el.height();
    var id = model.cid;
    var d3Data = {};
    model.set('d3Data', d3Data);

    width = width - axisMargin.left - axisMargin.right;
    height = height - axisMargin.top - axisMargin.bottom;

    var xAxisScale = d3.scale.linear()
        .range([0, width])
        .domain([0, width]);

    var svg = timeExplorerUtils.setupSvg($el[0], axisMargin, width, height);

    var xAxis = d3.svg.axis()
        .scale(xAxisScale)
        .orient('bottom');

    svg.append('g')
        .attr('class', 'x axis x-axis')
        .attr('id', 'timexaxis-' + id);

    _.extend(d3Data, {
        xAxisScale: xAxisScale,
        xAxis: xAxis,
        svg: svg,
        width: width,
        height: height
    });
}

function updateBottomAxis ($el, model) {
    // debug('update bottom axis');

    var data = model.get('data');
    var id = model.cid;
    var d3Data = model.get('d3Data');
    var numBins = data.numBins;

    var width = d3Data.width;
    var height = d3Data.height;
    var svg = d3Data.svg;

    var xAxisScale = d3Data.xAxisScale;
    var xScale = timeExplorerUtils.setupBinScale(width, data.numBins, data);


    var startDate = new Date(data.cutoffs[0]);
    var endDate = new Date(data.cutoffs[data.cutoffs.length - 1]);

    // Figure out which ticks to show
    var maxNumTicks = Math.floor(width/60);
    var numTicks = numBins + 1;
    // var tickContent = data.cutoffs;
    var tickContent = [];
    var tickPositions = [];
    var tickKeys = [];

    if (maxNumTicks < numTicks) {

        var step = Math.floor(numTicks/maxNumTicks);

        var runningPos = 0;

        // first and every step but last
        while (runningPos < data.cutoffs.length - 1) {
            var pos = xScale(runningPos);
            var val = data.cutoffs[runningPos];
            tickContent.push(val);
            tickPositions.push(pos);
            tickKeys.push(data.keys[runningPos]);

            runningPos += step;
        }
        tickContent.push(data.cutoffs[data.cutoffs.length - 1]);
        tickPositions.push(width);
        tickKeys.push(data.keys[data.keys.length - 1]);

        numTicks = tickContent.length;

    } else {

        _.each(data.cutoffs, function (cutoff, i) {
            var pos = xScale(i);
            tickContent.push(cutoff);
            tickPositions.push(pos);
            tickKeys.push(data.keys[i]);
        });

    }

    // Get rid of first and last ticks, because they should be represented in a more visible way
    // as what the active bounds are.
    tickContent = tickContent.slice(1, tickContent.length-1);
    tickPositions = tickPositions.slice(1, tickPositions.length-1);
    tickKeys = tickKeys.slice(1, tickKeys.length-1);

    var expandedTickTitles = [];
    var xAxis = d3Data.xAxis;

    xAxis.ticks(numTicks)
        .tickValues(tickPositions)
        .tickFormat(function (d, i) {

            // debug('tick arg: ', arguments);
            var raw = tickContent[i];
            if (raw) {
                var expanded = prettyPrintTime(raw);
                expandedTickTitles.push(expanded);
                var label = prettyPrintTime(raw, data.timeAggregation);
                return label;
            } else {
                return '';
            }
        });

    // TODO: Figure out how to get keying on axis animations
    // svg.select('#timexaxis-' + id).transition().duration(ZOOM_UPDATE_RATE).ease('linear')
        // .call(xAxis);

    var timeAxisSelection = svg.select('#timexaxis-' + id);

    if (!d3Data.lastTickKeys) {
        // No prior ticks, just draw
        timeAxisSelection.call(xAxis);
    } else {
        var lastTickKeys = d3Data.lastTickKeys;
        var lastTickPositions = d3Data.lastTickPositions;
        var lastTickContent = d3Data.lastTickContent;
        var lastNumTicks = lastTickPositions.length;



        if (d3Data.lastBottomVal > data.bottomVal) {
            // zoomed out

            var prevIds = _.range(lastTickContent.length);
            var newIds = _.range(tickContent.length);
            var dec = 0;
            _.each(tickContent, function (v, i) {
                if (v < d3Data.lastBottomVal) {
                    dec++;
                }
            });

            newIds = _.map(newIds, function (v) {
                return v - dec;
            });

            var positionTweens = [];
            _.each(newIds, function (v, i) {
                var start, stop;
                if (v < 0) {
                    start = 0;
                } else if (v >= lastTickContent.length) {
                    start = width;
                } else {
                    start = lastTickPositions[v];
                }

                stop = tickPositions[i];
                positionTweens.push([start, stop]);
            });

            var tweeningContent = tickContent;

        } else {
            // zoomed in

            var prevIds = _.range(lastTickContent.length);
            var newIds = _.range(tickContent.length);
            var dec = 0;
            _.each(lastTickContent, function (v, i) {
                if (v < data.bottomVal) {
                    dec++;
                }
            });

            prevIds = _.map(prevIds, function (v) {
                return v - dec;
            });

            var positionTweens = [];
            _.each(prevIds, function (v, i) {
                var start, stop;
                if (v < 0) {
                    stop = 0;
                } else if (v >= tickContent.length) {
                    stop = width;
                } else {
                    stop = tickPositions[v];
                }

                start = lastTickPositions[i];
                positionTweens.push([start, stop]);
            });

            var tweeningContent = lastTickContent;
        }



        var getInterpolatedTicks = function (t) {

            var newMin = data.bottomVal;
            var newMax = data.topVal;

            if (t > 0.99) {
                return {
                    numTicks: numTicks,
                    tickPositions: tickPositions,
                    tickContent: tickContent
                };
            }

            var tempNumTicks = tweeningContent.length;
            var tempTickContent = tweeningContent;

            var tempTickPositions = _.map(positionTweens, function (startStop/*, i*/) {
                var start = startStop[0];
                var stop = startStop[1];

                var interpolater = d3.interpolateNumber(start, stop);
                return interpolater(t);
            });

            return {
                numTicks: tempNumTicks,
                tickPositions: tempTickPositions,
                tickContent: tempTickContent
            };

        };

        timeAxisSelection.transition().duration(timeExplorerUtils.ZOOM_UPDATE_RATE).ease('linear').tween('#timexaxis-' + id, function (/*d, i*/) {

            return function (t) {
                // Make changes to axis
                var interpolatedTicks = getInterpolatedTicks(t);
                var expandedTickTitles = [];

                // TODO: Encapsulate these functions
                xAxis.ticks(interpolatedTicks.numTicks)
                    .tickValues(interpolatedTicks.tickPositions)
                    .tickFormat(function (d, i) {

                        // debug('tick arg: ', arguments);
                        var raw = interpolatedTicks.tickContent[i];
                        if (raw) {
                            var expanded = prettyPrintTime(raw);
                            expandedTickTitles.push(expanded);
                            var label = prettyPrintTime(raw, data.timeAggregation);
                            return label;
                        } else {
                            return '';
                        }
                    });


                // Update axis
                timeAxisSelection.call(xAxis);

                // Update mouseover tooltip content
                d3.select('#timexaxis-' + id)
                    .selectAll('text')
                    .attr('data-container', 'body')
                    .attr('data-placement', 'top')
                    .attr('data-toggle', 'tooltip')
                    .attr('data-original-title', function (d, i) {
                        return expandedTickTitles[i];
                    });

                d3.select('#timexaxis-' + id)
                .selectAll('text')
                .on('mouseover', function () {
                    var target = d3.event.target;
                    $(target).tooltip('fixTitle');
                    $(target).tooltip('show');
                })
                .on('mouseout', function () {
                    var target = d3.event.target;
                    $(target).tooltip('hide');
                });
                    };

        });

    }

    d3.select('#timexaxis-' + id)
        .selectAll('text')
        .attr('data-container', 'body')
        .attr('data-placement', 'top')
        .attr('data-toggle', 'tooltip')
        .attr('data-original-title', function (d, i) {
            return expandedTickTitles[i];
        });

    d3.select('#timexaxis-' + id)
        .selectAll('text')
        .on('mouseover', function () {
            var target = d3.event.target;
            $(target).tooltip('fixTitle');
            $(target).tooltip('show');
        })
        .on('mouseout', function () {
            var target = d3.event.target;
            $(target).tooltip('hide');
        });

    d3Data.lastTickKeys = tickKeys;
    d3Data.lastTickPositions = tickPositions;
    d3Data.lastTickContent = tickContent;
    d3Data.lastTopVal = data.topVal;
    d3Data.lastBottomVal = data.bottomVal;

}



//////////////////////////////////////////////////////////////////////////////
// Printing Utils
//////////////////////////////////////////////////////////////////////////////

function dayOfWeekAsString(idx) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][idx];
}

function hourAsString(idx) {
    var hour = idx % 12;
    var meridiemPart = ['AM', 'PM'][Math.floor(idx/12)];
    return '' + hour + ' ' + meridiemPart;
}

function prettyPrintTime(raw, timeAggregation) {
    var date = new Date(raw);

    if (timeAggregation === 'second') {
        return date.getUTCSeconds();
    } else if (timeAggregation === 'minute') {
        return date.getUTCMinutes();
    } else if (timeAggregation === 'hour') {
        return hourAsString(date.getUTCHours());
    } else if (timeAggregation === 'day') {
        return dayOfWeekAsString(date.getUTCDay());
    }

    return date.toUTCString();
}



module.exports = TimeExplorer;

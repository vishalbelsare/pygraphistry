'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:TimeExplorer');
var $       = window.$;
var Rx      = require('rxjs/Rx.KitchenSink');
              require('../rx-jquery-stub');
var _       = require('underscore');
var Handlebars = require('handlebars');
var Backbone = require('backbone');
    Backbone.$ = $;
var d3 = require('d3');
var Command = require('./command.js');
var util    = require('./util.js');
var FilterControl = require('./FilterControl.js');


//////////////////////////////////////////////////////////////////////////////
// CONSTANTS
//////////////////////////////////////////////////////////////////////////////

var TIME_BAR_HEIGHT = 60;
var MIN_COLUMN_WIDTH = 4;
var AXIS_HEIGHT = 20;
var BAR_SIDE_PADDING = 1;
var DOUBLE_CLICK_TIME = 500;

var ZOOM_UPDATE_RATE = 80;
var ZOOM_POLL_RATE = ZOOM_UPDATE_RATE + 5;
var SCROLL_SAMPLE_TIME = 5;
var SCROLLS_PER_ZOOM = Math.floor(ZOOM_UPDATE_RATE / SCROLL_SAMPLE_TIME);

var DEFAULT_TIME_AGGREGATION = 'day';

var color = d3.scale.ordinal()
        .range(['#929292', '#6B6868', '#0FA5C5', '#E35E13'])
        .domain(['user', 'userFocus', 'main', 'mainFocus']);

var margin = {
    top: 15,
    right: 10,
    bottom: 2,
    left: 10
};

var axisMargin = {
    top: 1,
    right: 10,
    bottom: 10,
    left: 10
};

var timeAggregationButtons = [
    {shortValue: 'D', longValue: 'day', active: true},
    {shortValue: 'H', longValue: 'hour'},
    {shortValue: 'M', longValue: 'minute'},
    {shortValue: 'S', longValue: 'second'}
];


var INTERACTION_MODE = 'FILTER';



var TimeExplorerModel = Backbone.Model.extend({});
var TimeBarModel = Backbone.Model.extend({});
var BottomAxisModel = Backbone.Model.extend({});
var TimeBarCollection = Backbone.Collection.extend({
    model: TimeBarModel,
    comparator: 'position'
});



//////////////////////////////////////////////////////////////////////////////
// Explorer / Data Management
//////////////////////////////////////////////////////////////////////////////







function TimeExplorer (socket, $div) {
    window.timeExplorer = this; // TODO KILL THIS TESTING THING
    var that = this;
    this.$div = $div;
    this.socket = socket;

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
            delete data['All'];
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
    console.log('GOT TIME FILTER UPDATE: ', newTimeFilter);
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
}

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

    var combinedAttr = '' + timeType + ':' + timeAttr;
    var timeFilterQuery = combinedAttr + ' >= "' + start + '" AND ' + combinedAttr + ' <= "' + stop + '"';

    var timeFilter = {
        type: timeType,
        attribute: timeAttr,
        query: FilterControl.prototype.queryFromExpressionString(timeFilterQuery)
    }

    var filters = otherFilters.concat([timeFilter]);

    var payload = {
        start: start,
        stop: stop,
        timeType: timeType,
        timeAttr: timeAttr,
        timeAggregation: timeAggregation,
        filters: filters
    }

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

TimeExplorer.prototype.zoomTimeRange = function (zoomFactor, numLeft, numRight) {
    // console.log('GOT ZOOM TIME REQUEST: ', arguments);
    // Negative if zoom out, positive if zoom in.


    // HACK UNTIL FIGURE OUT BACKPRESS IN RX5
    this.zoomCount++;

    var adjustedZoom = 1.0 - zoomFactor;

    // console.log('zoomReq: ', adjustedZoom);

    var params = {
        numLeft: numLeft,
        numRight: numRight,
        zoom: adjustedZoom
    };

    this.zoomRequests.onNext(params);
};

TimeExplorer.prototype.setupZoom = function () {
    var that = this;
    this.zoomRequests
    .inspectTime(ZOOM_POLL_RATE)
    .flatMap(function (request) {
        return that.queryChangeSubject
            .take(1)
            .map(function (desc) {
                return {request: request, timeDesc: desc};
            });
    }).do(function (data) {
        var req = data.request;
        var desc = data.timeDesc;

        var total = req.numLeft + req.numRight + 1;
        var numStart = (new Date(desc.start)).getTime();
        var numStop = (new Date(desc.stop)).getTime();

        var newStart = numStart;
        var newStop = numStop;

        // console.log('numStart, numStop: ', numStart, numStop);

        for (var i = 0; i < that.zoomCount; i++) {
            var diff = newStop - newStart;

            var leftRatio = (req.numLeft/total) || 1; // Prevents breaking on single bin
            var rightRatio = (req.numRight/total) || 1;

            // Scale diff based on how many zoom requests
            // minus raw = in, so pos diff or delta

            // Deltas are represented as zoom in, so change towards a smaller window
            var startDelta = leftRatio * diff * req.zoom;
            var stopDelta = rightRatio * diff * req.zoom;

            newStart = newStart + Math.round(startDelta);
            newStop = newStop - Math.round(stopDelta);

        }
        that.zoomCount = 0;

        // Guard against stop < start
        if (newStart >= newStop) {
            newStart = newStop - 1;
        }

        var newStartDate = new Date(newStart);
        var newStopDate = new Date(newStop);

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




function TimeExplorerPanel (socket, $parent, explorer) {
    var that = this;

    this.userBars = new TimeBarCollection({explorer: explorer});
    var panel = this;

    var MainBarView = Backbone.View.extend({

    });

    var BottomAxisView = Backbone.View.extend({
        tagName: 'div',
        className: 'bottomAxisDiv',
        template: Handlebars.compile($('#timeBarBottomAxisTemplate').html()),

        events: {},

        initialize: function () {
            this.listenTo(this.model, 'destroy', this.remove);
            this.listenTo(this.model, 'change:key', this.render);

            var params = {};
            var html = this.template(params);
            this.$el.html(html);
            this.$el.attr('cid', this.cid);
        },

        render: function () {
            var model = this.model;

            // if (model.get('initialized')) {
            //     updateBottomAxis(model.get('axisContainer'), model);
            //     return this;
            // }

            model.set('$el', this.$el);
            var axisContainer = this.$el.children('.axisContainer');
            axisContainer.empty();
            model.set('axisContainer', axisContainer);
            var axisHeight = '' + AXIS_HEIGHT + 'px';
            axisContainer.height(axisHeight);
            initializeBottomAxis(axisContainer, model);
            updateBottomAxis(axisContainer, model);

            // model.set('initialized', true);
            return this;
        }
    });

    var TimeBarView = Backbone.View.extend({
        tagName: 'div',
        className: 'timeBarDiv',
        template: Handlebars.compile($('#timeBarTemplate').html()),

        events: {
            'click .timeAggButton': 'changeTimeAgg',
        },

        initialize: function () {
            this.listenTo(this.model, 'destroy', this.remove);
            this.listenTo(this.model, 'change:timeStamp', this.newContent);
            // TODO: listen to changes and render

            // Set default values
            this.model.set('pageX', 0);
            this.model.set('pageY', 0);

            var params = {

            };

            if (this.model.get('showTimeAggregationButtons')) {
                params.timeAggregationButtons = timeAggregationButtons;
            }

            var html = this.template(params);
            this.$el.html(html);
            this.$el.attr('cid', this.cid);
        },

        newContent: function () {
            // this.model.set('initialized', false);
            this.render();
        },

        renderMouseEffects: function () {
            var model = this.model;

            // Don't do anything, you haven't been populated yet
            if (!this.model.get('data')) {
                return;
            }

            // Don't do first time work.
            // TODO: Should this be initialize instead?
            if (model.get('initialized')) {
                updateTimeBarMouseover(model.get('vizContainer'), model);
                return this;
            }
        },

        render: function () {
            var model = this.model;

            // Don't do anything, you haven't been populated yet
            if (!this.model.get('data')) {
                return;
            }

            // Don't do first time work.
            // TODO: Should this be initialize instead?
            if (model.get('initialized')) {
                updateTimeBar(model.get('vizContainer'), model);
                return this;
            }

            // Need to init svg and all that.
            model.set('$el', this.$el);
            var vizContainer = this.$el.children('.vizContainer');
            vizContainer.empty();
            model.set('vizContainer', vizContainer);
            var vizHeight = '' + TIME_BAR_HEIGHT + 'px';
            vizContainer.height(vizHeight);
            initializeTimeBar(vizContainer, model);
            updateTimeBar(vizContainer, model);

            model.set('initialized', true);
            return this;
        },

        mousemoveParent: function (evt) {
            this.model.set('pageX', evt.pageX);
            this.model.set('pageY', evt.pageY);
            this.renderMouseEffects();
        },

        mouseoutParent: function (evt) {
            this.model.set('pageX', -1);
            this.model.set('pageY', -1);
            this.renderMouseEffects();
        },

        getBinForPosition: function (pageX) {
            return getActiveBinForPosition(this.$el, this.model, pageX);
        },

        changeTimeAgg: function (evt) {
            evt.preventDefault();
            evt.stopPropagation();
            // console.log('GOT CLICK: ', evt);

            var target = evt.target;
            var shortText = $(target).text();
            $(target).parent().children('button').not('#timeAggButton-' + shortText).removeClass('active');
            $(target).addClass('active');
            // console.log('TARGET: ', target);
            // console.log($(target));
            var aggValue = $(target).data('aggregation-value');
            // console.log('aggValue: ', aggValue);


            this.model.get('explorer').modifyTimeDescription({
                timeAggregation: aggValue
            });

        },

        close: function () {

        }
    });

    var UserBarsView = Backbone.View.extend({
        el: $('#timeExplorerBody'),
        template: Handlebars.compile($('#timeExplorerBodyTemplate').html()),
        events: {
            'click #newAttrSubmitButton': 'submitNewAttr',
        },

        initialize: function () {
            this.listenTo(this.collection, 'add', this.addBar);
            this.listenTo(this.collection, 'remove', this.removeBar);
            this.listenTo(this.collection, 'reset', this.addAll);

            this.render();
        },

        render: function () {
            // this.collection.sort(); //TODO

            this.$el.empty();

            var newDiv = $('<div id="timeExplorerUserBarsRenderingContainer"></div>');
            this.$el.append(newDiv);
            newDiv = $('#timeExplorerUserBarsRenderingContainer');

            this.collection.each(function (child) {
                // TODO: This guard is a hack. I don't know how to initialize backbone
                if (child.view) {
                    newDiv.append(child.view.el);
                    child.view.render();

                }
            });

            // console.log('RENDERING USER BARS VIEW');

            var params = {

            };
            var addRowHtml = this.template(params);
            newDiv.append(addRowHtml);

            this.$el.attr('cid', this.cid);
            // this.$el.empty();
            // this.$el.append(newDiv);
        },

        submitNewAttr: function (evt) {
            evt.preventDefault();
            var newType = $('#newType').val();
            var newAttr = $('#newAttr').val();
            var newQuery = $('#newQuery').val();
            // TODO: Don't use this global. Instead properly structure userbars as a model, that contains a collection.
            explorer.addActiveQuery(newType, newAttr, newQuery);
            // this.collection.get('explorer').addActiveQuery(newType, newAttr, newQuery);
        },

        addBar: function (model) {
            var view = new TimeBarView({model: model});
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
        template: Handlebars.compile($('#timeExplorerSideInputTemplate').html()),
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
    // var SideInputModel = Backbone.Model.extend({});
    // this.sideInputView = new SideInputView({model: new SideInputModel({explorer: explorer})});

    this.userBarsView = new UserBarsView({explorer: explorer, collection: this.userBars});
    var mainBarModel = new TimeBarModel({explorer: explorer, timeStamp: Date.now(), showTimeAggregationButtons: true});
    this.mainBarView = new TimeBarView({model: mainBarModel});
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
            'click #timeAttrSubmitButton': 'submitTimeAttr',
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
            this.userBarsView.$el.css('visibility', 'hidden');
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

            this.userBarsView.$el.css('visibility', 'visible');
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
                    var zoomFactor = (wheelEvent.deltaY < 0 ? zoomBase : 1.0 / zoomBase) || 1.0;

                    var xPos = wheelEvent.pageX;
                    var selectedBin = that.mainBarView.getBinForPosition(xPos);
                    var mainBarData = that.model.get('all');
                    var numBins = mainBarData.numBins;

                    var numLeft = selectedBin;
                    var numRight = numBins - selectedBin - 1;

                    // TODO: Prevent this case in general?
                    if (numLeft < 0 || numRight < 0) {
                        return;
                    }

                    var explorer = that.model.get('explorer');
                    explorer.zoomTimeRange(zoomFactor, numLeft, numRight);

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

                            // TODO: Prevent delta from going off the border
                            var delta = newX - startX;

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
                            var leftBin = that.mainBarView.getBinForPosition(leftX);
                            var rightBin = that.mainBarView.getBinForPosition(rightX);

                            var mainBarData = that.model.get('all');
                            var cutoffs = mainBarData.cutoffs;

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
                var barModel = new TimeBarModel({explorer: explorer});
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

function initializeTimeBar ($el, model) {
    // debug('initializing time bar: ', model);
    // debug('$el: ', $el);
    // debug('$el sizes: ', $el.width(), $el.height());

    var width = $el.width() - margin.left - margin.right;
    var height = $el.height() - margin.top - margin.bottom;
    var d3Data = {};
    model.set('d3Data', d3Data);

    var svg = setupSvg($el[0], margin, width, height);

    _.extend(d3Data, {
        svg: svg,
        width: width,
        height: height
    });
}

function getActiveBinForPosition ($el, model, pageX) {
    var d3Data = model.get('d3Data');
    var width = d3Data.width;
    if (!width) {
        width = $el.width() - margin.left - margin.right;
    }
    var data = model.get('data');
    var svg = d3Data.svg;
    var xScale = setupBinScale(width, data.numBins)

    var svgOffset = d3Data.svgOffset;
    if (!svgOffset) {
        var jquerySvg = $(svg[0]);
        svgOffset = jquerySvg.offset();
        d3Data.svgOffset = svgOffset;
    }
    var adjustedX = pageX - svgOffset.left;
    var activeBin = Math.floor(xScale.invert(adjustedX));
    return activeBin;
}

function tagBins (rawBins, cutoffs) {
    var taggedBins = _.map(rawBins, function (v, i) {
        return {
            binVal: v,
            key: cutoffs[i]
        };
    });

    return taggedBins;
}

function updateTimeBarMouseover ($el, model) {

    var d3Data = model.get('d3Data');
    var width = d3Data.width;
    var height = d3Data.height;
    var data = model.get('data');
    var maxBinValue = model.get('maxBinValue');
    var id = model.cid;
    var taggedBins = tagBins(data.bins, data.cutoffs);
    var barType = model.get('barType');

    var svg = d3Data.svg;

    // Guard against no data.
    // TODO: Do this more properly
    if (!data) {
        return;
    }

    if (d3Data.lastDraw === 'lineChart') {
        updateTimeBarLineChartMouseover($el, model);
        return;
    }

    //////////////////////////////////////////////////////////////////////////
    // Upper Tooltip
    //////////////////////////////////////////////////////////////////////////

    var upperTooltip = svg.selectAll('.upperTooltip');
    var pageX = model.get('pageX');
    var activeBin = getActiveBinForPosition($el, model, pageX);
    var upperTooltipValue = data.bins[activeBin];

    var svgOffset = d3Data.svgOffset;
    if (!svgOffset) {
        var jquerySvg = $(svg[0]);
        svgOffset = jquerySvg.offset();
        d3Data.svgOffset = svgOffset;
    }
    var adjustedX = pageX - svgOffset.left;

    upperTooltip.attr('x', adjustedX + 3)
        .text(upperTooltipValue);

    upperTooltip.data([''])
        .enter().append('text')
        .classed('upperTooltip', true)
        .classed('unselectable', true)
        .attr('y', -5)
        .attr('x', 0)
        .attr('opacity', 1.0)
        .attr('font-size', '0.7em')
        .attr('pointer-events', 'none')
        .text('');

    //////////////////////////////////////////////////////////////////////////
    // Update Bar Colors
    //////////////////////////////////////////////////////////////////////////


    var recolorBar = function (d) {
        if (d.idx === activeBin) {
            // debug('color focus');
            var colorVal = color(barType + 'Focus');
            // debug('colorVal: ', colorVal);
            return color(barType + 'Focus');
        } else {
            return color(barType);
        }
    };

    var columns = svg.selectAll('.column');

    var bars = columns.selectAll('.bar-rect')
        .style('fill', recolorBar);
}


function updateTimeBarLineChartMouseover ($el, model) {
    // debug('updating time bar: ', model);

    var d3Data = model.get('d3Data');
    var width = d3Data.width;
    var height = d3Data.height;
    var data = model.get('data');
    var maxBinValue = model.get('maxBinValue');
    var id = model.cid;
    var barType = model.get('barType');

    var svg = d3Data.svg;

    // Guard against no data.
    // TODO: Do this more properly
    if (!data) {
        return;
    }

    //////////////////////////////////////////////////////////////////////////
    // Upper Tooltip
    //////////////////////////////////////////////////////////////////////////

    var upperTooltip = svg.selectAll('.upperTooltip');
    var pageX = model.get('pageX');
    var activeBin = getActiveBinForPosition($el, model, pageX);
    var upperTooltipValue = data.bins[activeBin];

    var svgOffset = d3Data.svgOffset;
    if (!svgOffset) {
        var jquerySvg = $(svg[0]);
        svgOffset = jquerySvg.offset();
        d3Data.svgOffset = svgOffset;
    }

    var adjustedX = pageX - svgOffset.left;

    upperTooltip.attr('x', adjustedX + 3)
        .text(upperTooltipValue);

    upperTooltip.data([''])
        .enter().append('text')
        .classed('upperTooltip', true)
        .classed('unselectable', true)
        .attr('y', -5)
        .attr('x', 0)
        .attr('opacity', 1.0)
        .attr('font-size', '0.7em')
        .attr('pointer-events', 'none')
        .text('');
}


function updateTimeBar ($el, model) {
    // debug('updating time bar: ', model);

    var d3Data = model.get('d3Data');
    var width = d3Data.width;
    var height = d3Data.height;
    var data = model.get('data');
    var maxBinValue = model.get('maxBinValue');
    var id = model.cid;
    var taggedBins = tagBins(data.bins, data.cutoffs);

    var svg = d3Data.svg;

    // Guard against no data.
    // TODO: Do this more properly
    if (!data) {
        return;
    }

    // Draw as time series if too many
    if ((width/MIN_COLUMN_WIDTH) < data.numBins) {
        updateTimeBarLineChart($el, model);
        d3Data.lastDraw = 'lineChart';
        return;
    }

    // Reset if line Chart
    if (d3Data.lastDraw === 'lineChart') {
        // console.log('RESETTING SVG BECAUSE WAS LINE');
        svg.selectAll("*").remove();
    }

    var barType = model.get('barType');

    var xScale = setupBinScale(width, data.numBins)
    var yScale = setupAmountScale(height, maxBinValue, data.bins);

    var barWidth = Math.floor(width/data.numBins) - BAR_SIDE_PADDING;

    //////////////////////////////////////////////////////////////////////////
    // Compute mouse position values
    //////////////////////////////////////////////////////////////////////////



    var pageX = model.get('pageX');
    var activeBin = getActiveBinForPosition($el, model, pageX);

    var recolorBar = function (d) {
        if (d.idx === activeBin) {
            // debug('color focus');
            var colorVal = color(barType + 'Focus');
            // debug('colorVal: ', colorVal);
            return color(barType + 'Focus');
        } else {
            return color(barType);
        }
    };


    //////////////////////////////////////////////////////////////////////////
    // Make Line Beneath
    //////////////////////////////////////////////////////////////////////////
    var lineDimensions = {
        x1: 0,
        y1: height,
        x2: width,
        y2: height
    };

    var lines = svg.selectAll('.line')
        .data([lineDimensions]);

    lines.enter().append('line')
        .classed('line', true)
        .style('stroke', 'black')
        .attr('x1', function (d) {
            return d.x1;
        })
        .attr('x2', function (d) {
            return d.x2;
        })
        .attr('y1', function (d) {
            return d.y1;
        })
        .attr('y2', function (d) {
            return d.y2;
        });

    //////////////////////////////////////////////////////////////////////////
    // Name Caption
    //////////////////////////////////////////////////////////////////////////

    var nameCaption = svg.selectAll('.nameCaption');
    nameCaption.data([''])
        .enter().append('text')
        .classed('nameCaption', true)
        .classed('unselectable', true)
        .attr('y', -5)
        .attr('x', 5)
        .attr('opacity', 1.0)
        .attr('font-size', '0.7em')
        .text(data.name);

    //////////////////////////////////////////////////////////////////////////
    // Make Columns
    //////////////////////////////////////////////////////////////////////////

    var columns = svg.selectAll('.column')
        .data(taggedBins, function (d, i) {
            // console.log('COLUMN KEY: ', d, i);
            return d.key;
        });

    var columnRects = columns.selectAll('.column-rect');

    columns.exit().remove();

    columns.transition().duration(ZOOM_UPDATE_RATE).ease('linear')
        .attr('transform', function (d, i) {
            // console.log('UPDATING COLUMN');
            return 'translate(' + xScale(i) + ',0)';
        });

    columnRects.transition().duration(ZOOM_UPDATE_RATE).ease('linear')
        .attr('width', Math.floor(barWidth + BAR_SIDE_PADDING));

    var enterTweenTransformFunc = function (d, i) {
        return 'translate(' + xScale(i) + ',0)';
    };

    var newCols = columns.enter().append('g');

    newCols.classed('g', true)
        .classed('column', true)
        .append('rect')
            .classed('column-rect', true)
            .attr('width', barWidth + BAR_SIDE_PADDING)
            .attr('height', height)
            .attr('opacity', 0);

    // Store a copy in this scope (because it'll later be updated by the time this function executes)
    var topVal = d3Data.lastTopVal;

    newCols.transition().duration(ZOOM_UPDATE_RATE).ease('linear')
        .attrTween('transform', function (d, i, a) {
            // console.log('TESTING TRANSFORM: ', d, i, d3Data);
            if (topVal && d.key >= topVal) {
                // console.log('TOP PATH, init width');
                return d3.interpolate('translate(' + width + ',0)', String(enterTweenTransformFunc.call(this, d, i)));
            } else {
                // console.log('BOTTOM PATH, init 0');
                return d3.interpolate('translate(0,0)', String(enterTweenTransformFunc.call(this, d, i)));
            }
        });

    // TODO: Is this assignment correct?
    var bars = columns.selectAll('.bar-rect')
        // .data(data.bins);
        .data(function (d, i) {
            var params = {
                val: d.binVal,
                key: d.key,
                idx: i
            };
            return [params];
        }, function (d, i) {
            // console.log('BAR ARGS: ', d, i);
            return d.key;
            // return d.idx;
        });

    bars.exit().remove();

    var dataPlacement = (data.name === 'All') ? 'all' : 'user';

    // console.log('barWidth: ', barWidth);

    // bars
    bars.transition().duration(ZOOM_UPDATE_RATE).ease('linear')
        .attr('width', barWidth)
        .attr('fill', recolorBar)
        .attr('y', function (d) {
            return height - yScale(d.val);
        })
        .attr('height', function (d) {
            return yScale(d.val);
        });

    bars.enter().append('rect')
        .attr('class', 'bar-rect')
        .style('pointer-events', 'none')
        .style('opacity', 1)
        .attr('fill', recolorBar)
        .attr('width', barWidth)
        .attr('y', function (d) {
            // console.log('ENTERING BAR');
            return height - yScale(d.val);
        })
        .attr('height', function (d) {
            return yScale(d.val);
        });

    // Handle mouse position specific parts
    updateTimeBarMouseover($el, model);


    d3Data.lastDraw = 'barChart';
    d3Data.lastTopVal = data.topVal;
    d3Data.lastBottomVal = data.bottomVal;

    // console.log('Setting top vals. Top1, top2: ', data.topVal, data.cutoffs[data.cutoffs.length - 1]);

}


function updateTimeBarLineChart ($el, model) {
    // debug('updating time bar: ', model);

    var d3Data = model.get('d3Data');
    var width = d3Data.width;
    var height = d3Data.height;
    var data = model.get('data');
    var maxBinValue = model.get('maxBinValue');
    var id = model.cid;

    var svg = d3Data.svg;

    // Guard against no data.
    // TODO: Do this more properly
    if (!data) {
        return;
    }

    // Reset because I don't know how to do it cleanly
    if (d3Data.lastDraw === 'barChart' || (!model.get('lineUnchanged'))) {
        // debug('REMOVING');
        svg.selectAll("*").remove();
    }

    var barType = model.get('barType');

    var xScale = setupBinScale(width, data.numBins)
    var yScale = setupAmountScale(height, maxBinValue, data.bins);

    var barWidth = Math.floor(width/data.numBins) - BAR_SIDE_PADDING;

    //////////////////////////////////////////////////////////////////////////
    // Make Line Beneath
    //////////////////////////////////////////////////////////////////////////
    var lineDimensions = {
        x1: 0,
        y1: height,
        x2: width,
        y2: height
    };

    var lines = svg.selectAll('.line')
        .data([lineDimensions]);

    lines.enter().append('line')
        .classed('line', true)
        .style('stroke', 'black')
        .attr('x1', function (d) {
            return d.x1;
        })
        .attr('x2', function (d) {
            return d.x2;
        })
        .attr('y1', function (d) {
            return d.y1;
        })
        .attr('y2', function (d) {
            return d.y2;
        });

    //////////////////////////////////////////////////////////////////////////
    // Name Caption
    //////////////////////////////////////////////////////////////////////////

    var nameCaption = svg.selectAll('.nameCaption');
    nameCaption.data([''])
        .enter().append('text')
        .classed('nameCaption', true)
        .classed('unselectable', true)
        .attr('y', -5)
        .attr('x', 5)
        .attr('opacity', 1.0)
        .attr('font-size', '0.7em')
        .text(data.name);

    //////////////////////////////////////////////////////////////////////////
    // Make Area Lines
    //////////////////////////////////////////////////////////////////////////

    var area = d3.svg.area()
        .x(function(d, i) { return xScale(i); })
        .y0(height)
        .y1(function(d) { return height - yScale(d); });

    // var areaChart = svg.selectAll('.areaChart')
    //     .datum(data.bins);

    // HACKY WAY TO AVOID REDRAW
    var areaChart = svg.selectAll('.areaChart');

    if (!model.get('lineUnchanged')) {
        svg.append('path')
            .datum(data.bins)
            .classed('areaChart', true)
            .classed('area', true)
            .attr('d', area)
            .attr('fill', function () {
                return color(barType);
            });
    }

    // Handle mouse position specific updates
    updateTimeBarLineChartMouseover($el, model);

    model.set('lineUnchanged', true);

}














function setupSvg (el, margin, width, height) {
    return d3.select(el).append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
        .append('g')
            .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
}

function setupBinScale (width, numBins) {
    return d3.scale.linear()
        .range([0, width])
        .domain([0, numBins]);
}

function setupAmountScale (height, maxBin) {
    return d3.scale.linear()
        .range([0, height])
        .domain([0, maxBin]);
}



//////////////////////////////////////////////////////////////////////////////
// BOTTOM AXIS
//////////////////////////////////////////////////////////////////////////////


function initializeBottomAxis ($el, model) {
    // debug('init bottom axis');

    var width = $el.width();
    var height = $el.height();
    var data = model.get('data');
    var id = model.cid;
    var d3Data = {};
    model.set('d3Data', d3Data);
    var numBins = data.numBins;

    width = width - axisMargin.left - axisMargin.right;
    height = height - axisMargin.top - axisMargin.bottom;

    var xScale = setupBinScale(width, data.numBins)

    var startDate = new Date(data.cutoffs[0]);
    var endDate = new Date(data.cutoffs[data.cutoffs.length - 1]);

    // Figure out which ticks to show
    var maxNumTicks = Math.floor(width/60);
    var numTicks = numBins + 1;
    var tickContent = data.cutoffs;


    var numbersToShow;
    if (maxNumTicks < numTicks) {
        numbersToShow = [];

        var step = Math.floor(numTicks/maxNumTicks);

        var largestNumber = 0;
        while (largestNumber < data.cutoffs.length - 1) {
            // Validate that it's not too close to the end
            var ratioTillEnd = ((data.cutoffs.length - 1 - largestNumber) / step);
            if (ratioTillEnd > 0.25) {
                numbersToShow.push(largestNumber);
            }
            largestNumber += step;
        }
        numbersToShow.push(data.cutoffs.length-1);

        maxNumTicks = numbersToShow.length;
        numTicks = maxNumTicks;

    } else {
        numbersToShow = _.range(numTicks);
    }

    var expandedTickTitles = [];
    var xAxis = d3.svg.axis()
        .scale(xScale)
        .orient('bottom')
        .ticks(numTicks)
        .tickValues(numbersToShow)
        .tickFormat(function (d) {
            // debug('tick arg: ', arguments);
            var raw = tickContent[d];
            if (raw) {
                var expanded = prettyPrintTime(raw);
                expandedTickTitles.push(expanded);
                var label = prettyPrintTime(raw, data.timeAggregation);
                return label;
            } else {
                return '';
            }
        });

    var svg = setupSvg($el[0], axisMargin, width, height);

    svg.append('g')
        .attr('class', 'x axis')
        .attr('id', 'timexaxis-' + id)
        .call(xAxis);

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

    _.extend(d3Data, {
        xScale: xScale,
        xAxis: xAxis,
        svg: svg
    });
}

function updateBottomAxis ($el, model) {
    // debug('update bottom axis');
}

//////////////////////////////////////////////////////////////////////////////
// Printing Utils
//////////////////////////////////////////////////////////////////////////////

function dayOfWeekAsString(idx) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][idx];
}

function hourAsString(idx) {
    var hour = idx % 12;
    var ampm = ['AM', 'PM'][Math.floor(idx/12)];
    return '' + hour + ' ' + ampm;
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

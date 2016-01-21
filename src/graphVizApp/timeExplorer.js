'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:TimeExplorer');
var $       = window.$;
var Rx      = require('rx');
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

var TIME_BAR_HEIGHT = 75;
var MIN_COLUMN_WIDTH = 4;
var AXIS_HEIGHT = 20;
var BAR_SIDE_PADDING = 1;
var DOUBLE_CLICK_TIME = 500;

var color = d3.scale.ordinal()
        .range(['#929292', '#6B6868', '#0FA5C5', '#E35E13'])
        .domain(['user', 'userFocus', 'main', 'mainFocus']);

var margin = {
    top: 15,
    right: 5,
    bottom: 2,
    left: 5
};

var axisMargin = {
    top: 0,
    right: 5,
    bottom: 10,
    left: 5
};






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

    this.panel = new TimeExplorerPanel(socket, $div, this);

    this.getTimeDataCommand = new Command('getting time data', 'timeAggregation', socket);
    this.getTimeBoundsCommand = new Command('getting time bounds', 'getTimeBoundaries', socket);

    this.activeQueries = [
        {
            name: 'smallTime',
            query: that.makeQuery('point', 'time', 'point:time < "2007-01-02T00:01:24+00:00"')
        },

        {
            name: 'medTime',
            query: that.makeQuery('point', 'time', 'point:time >= "2007-01-02T00:01:24+00:00" and point:time < "2007-01-05T00:01:24+00:00"')
        },

        {
            name: 'largeTime',
            query: that.makeQuery('point', 'time', 'point:time >= "2007-01-05T00:01:24+00:00"')

        }
    ];
    this.timeDescription = {
        timeType: 'point',
        timeAttr: 'time',
        timeAggregation: 'day',
        start: null,
        stop: null
    };

    this.queryChangeSubject = new Rx.ReplaySubject(1);




    this.getTimeBoundsCommand.sendWithObservableResult(this.timeDescription)
        .do(function (resp) {
            that.originalStart = resp.min;
            that.originalStop = resp.max;

            that.modifyTimeDescription({
                start: resp.min,
                stop: resp.max
            });

            // that.queryChangeSubject.take(1).do(function (timeDesc) {
            //     timeDesc.start = resp.min;
            //     timeDesc.stop = resp.max;
            //     debug('ON NEXTING: ', timeDesc);
            //     that.queryChangeSubject.onNext(timeDesc);
            // }).subscribe(_.identity);
        }).subscribe(_.identity);


    this.queryChangeSubject.filter(function (desc) {
            // Not initialized
            return !(_.contains(_.values(desc), null));
        }).flatMap(function (timeDesc) {
            var timeType = timeDesc.timeType;
            var timeAttr = timeDesc.timeAttr;
            var timeAggregation = timeDesc.timeAggregation;
            var start = timeDesc.start;
            var stop = timeDesc.stop;
            return that.getMultipleTimeData(timeType, timeAttr, start, stop, timeAggregation, that.activeQueries);
        }).do(function (data) {
            var dividedData = {};
            dividedData.all = data._all;
            delete data['_all'];
            dividedData.user = data;
            dividedData.maxBinValue = dividedData.all.maxBin;

            that.panel.model.set(dividedData);
        }).subscribe(_.identity, util.makeErrorHandler('Error getting time data stream'));


    // this.getTimeBoundsCommand.sendWithObservableResult(this.timeDescription)
    //     .flatMap(function (resp) {
    //         var timeType = that.timeDescription.timeType;
    //         var timeAttr = that.timeDescription.timeAttr;
    //         var timeAggregation = that.timeDescription.timeAggregation;
    //         return that.getMultipleTimeData(timeType, timeAttr, resp.min, resp.max, timeAggregation, that.activeQueries);
    //     }).do(function (data) {
    //         debug('Got time data stream: ', data);
    //         var dividedData = {};
    //         dividedData.all = data._all;
    //         delete data['_all'];
    //         dividedData.user = data;
    //         dividedData.maxBinValue = dividedData.all.maxBin;

    //         that.panel.model.set(dividedData);
    //     }).subscribe(_.identity, util.makeErrorHandler('Error getting time data stream'));

    this.queryChangeSubject.onNext(this.timeDescription);


    debug('Initialized Time Explorer');
}

TimeExplorer.prototype.modifyTimeDescription = function (change) {
    var that = this;
    that.queryChangeSubject.take(1).do(function (timeDesc) {
        _.extend(timeDesc, change);
        that.queryChangeSubject.onNext(timeDesc);
    }).subscribe(_.identity);
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

    return this.getTimeDataCommand.sendWithObservableResult(payload)
        .map(function (resp) {
            resp.data.name = name;
            return resp.data;
        });
};


TimeExplorer.prototype.getMultipleTimeData = function (timeType, timeAttr, start, stop, timeAggregation, activeQueries) {
    var that = this;
    var subjects = _.map(activeQueries, function (queryWrapper) {
        return that.getTimeData(timeType, timeAttr, start, stop, timeAggregation, [queryWrapper.query], queryWrapper.name);
    });

    var allSubject = that.getTimeData(timeType, timeAttr, start, stop, timeAggregation, [], '_all');
    subjects.push(allSubject);

    return Rx.Observable.zip(subjects, function () {
        debug('zipping');
        var ret = {};
        for (var i = 0; i < arguments.length; i++) {
            var obj = arguments[i];
            ret[obj.name] = obj;
        }
        return ret;
    });
}



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

        },

        initialize: function () {
            this.listenTo(this.model, 'destroy', this.remove);
            this.listenTo(this.model, 'change:timeStamp', this.render);
            // TODO: listen to changes and render

            // Set default values
            this.model.set('pageX', 0);
            this.model.set('pageY', 0);

            var params = {};
            var html = this.template(params);
            this.$el.html(html);
            this.$el.attr('cid', this.cid);
        },

        render: function () {
            var model = this.model;

            // Don't do first time work.
            // TODO: Should this be initialize instead?
            if (model.get('initialized')) {
                updateTimeBar(model.get('vizContainer'), model);
                return this;
            }

            // Need to init svg and all that.
            model.set('$el', this.$el);
            var vizContainer = this.$el.children('.vizContainer');
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
            this.render();
        },

        getBinForPosition: function (pageX) {
            return getActiveBinForPosition(this.$el, this.model, pageX);
        },

        close: function () {

        }
    });

    var UserBarsView = Backbone.View.extend({
        el: $('#timeExplorerBody'),
        events: {

        },

        initialize: function () {
            this.listenTo(this.collection, 'add', this.addBar);
            this.listenTo(this.collection, 'remove', this.removeBar);
            this.listenTo(this.collection, 'reset', this.addAll);

        },

        render: function () {
            // this.collection.sort(); //TODO
            var newDiv = $('<div></div>');
            this.collection.each(function (child) {
                newDiv.append(child.view.el);
            });

            this.$el.empty();
            this.$el.append(newDiv);
        },

        addBar: function (model) {
            var view = new TimeBarView({model: model});
            model.view = view;
            this.$el.append(view.el);
            view.render();
        },

        removeBar: function () {
            //TODO
        },

        addAll: function () {
            this.$el.empty();
            this.collection.each(this.addBar, this);

        },

        mousemoveParent: function (evt) {
            this.collection.each(function (child) {
                child.view.mousemoveParent(evt);
            });
        }
    });

    this.userBarsView = new UserBarsView({collection: this.userBars});
    var mainBarModel = new TimeBarModel({explorer: explorer, timeStamp: Date.now()});
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
        $dragBox: $('#timeExplorerDragBox'),
        $verticalLine: $('#timeExplorerVerticalLine'),
        userBarsView: that.userBarsView,
        mainBarView: that.mainBarView,
        bottomAxisView: that.bottomAxisView,

        events: {
            'mousemove': 'mousemove',
            'mousedown #timeExplorerVizContainer': 'handleMouseDown'
        },

        initialize: function () {
            // TODO: Add, remove, reset handlers
            this.listenTo(this.model, 'change', this.updateChildren);
            this.setupVerticalLine();
            this.render();


        },

        handleMouseDown: function (evt) {
            var that = this;

            // In the middle of prior click/double click. Don't start new one.
            if (that.handlingMouseDown) {
                return;
            }
            that.handlingMouseDown = true;

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

                    debug('dragBox: ', that.$dragBox[0]);

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

        },

        setupVerticalLine: function () {
            var that = this;
            this.$el.on('mouseover', function (evt) {
                that.$verticalLine.css('display', 'block');
            });
            this.$el.on('mouseout', function (evt) {
                that.$verticalLine.css('display', 'none');
            });
            this.$el.on('mousemove', function (evt) {
                var x = evt.pageX - 1;
                that.$verticalLine.css('left', '' + x + 'px');
            });
        },

        render: function () {
            // TODO: New div and render correct eleements in right order
            this.$timeExplorerMain.append(this.mainBarView.el);
            this.$timeExplorerAxisContainer.append(this.bottomAxisView.el);
        },

        mousemove: function (evt) {
            this.mainBarView.mousemoveParent(evt);
            this.userBarsView.mousemoveParent(evt);
        },

        updateChildren: function () {
            var data = this.model.attributes;
            var explorer = this.model.get('explorer');
            var params;

            debug('data: ', data);

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
                lineUnchanged: false
            };
            this.mainBarView.model.id = params.data.name;
            this.mainBarView.model.set('barType', 'main');
            this.mainBarView.model.set(params);

            var barModels = [];
            var collection = this.userBarsView.collection;

            //TODO: Update stuff that already exists instead of overwriting

            //Add new data elements
            _.each(data.user, function (val, key) {
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

            // TODO: set not reset
            collection.reset(barModels);
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

    var width = $el.width() - margin.left - margin.right;
    var height = $el.height() - margin.top - margin.bottom;
    var d3Data = {};
    model.set('d3Data', d3Data);

    var svg = setupSvg($el[0], margin, width, height);

    _.extend(d3Data, {
        svg: svg
    });
}

function getActiveBinForPosition ($el, model, pageX) {
    var width = $el.width() - margin.left - margin.right;
    var d3Data = model.get('d3Data');
    var data = model.get('data');
    var svg = d3Data.svg;
    var xScale = setupBinScale(width, data.numBins)

    var jquerySvg = $(svg[0]);
    var svgOffset = jquerySvg.offset();
    var adjustedX = pageX - svgOffset.left;
    var activeBin = Math.floor(xScale.invert(adjustedX));
    return activeBin;
}

function updateTimeBar ($el, model) {
    // debug('updating time bar: ', model);

    var width = $el.width() - margin.left - margin.right;
    var height = $el.height() - margin.top - margin.bottom;
    var d3Data = model.get('d3Data');
    var data = model.get('data');
    var maxBinValue = model.get('maxBinValue');
    var id = model.cid;

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
    // Upper Tooltip
    //////////////////////////////////////////////////////////////////////////

    var upperTooltip = svg.selectAll('.upperTooltip');
    var pageX = model.get('pageX');
    var activeBin = getActiveBinForPosition($el, model, pageX);
    var upperTooltipValue = data.bins[activeBin];

    upperTooltip.attr('x', pageX)
        .text(upperTooltipValue);

    upperTooltip.data([''])
        .enter().append('text')
        .attr('class', 'upperTooltip')
        .attr('y', -5)
        .attr('x', 0)
        .attr('opacity', 1.0)
        .attr('font-size', '0.7em')
        .text('Text Data');

    //////////////////////////////////////////////////////////////////////////
    // Make Columns
    //////////////////////////////////////////////////////////////////////////

    var columns = svg.selectAll('.column')
        .data(data.bins);

    var columnRects = columns.selectAll('rect');

    columns.attr('transform', function (d, i) {
            return 'translate(' + xScale(i) + ',0)';
        });

    columnRects.attr('width', barWidth + BAR_SIDE_PADDING);


    columns.enter().append('g')
        .classed('g', true)
        .classed('column', true)
        .attr('transform', function (d, i) {
            return 'translate(' + xScale(i) + ',0)';
        }).append('rect')
            .attr('width', barWidth + BAR_SIDE_PADDING)
            .attr('height', height)
            .attr('opacity', 0);

    columns.exit().remove();

    // TODO: Is this assignment correct?
    var bars = columns.selectAll('.bar-rect')
        // .data(data.bins);
        .data(function (d, i) {
            var params = {
                val: d,
                idx: i
            };
            return [params];
        }, function (d, i) {
            return d.idx;
        });

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

    bars.style('fill', recolorBar);

    var dataPlacement = (data.name === '_all') ? 'all' : 'user';

    bars.attr('width', barWidth)
        .attr('y', function (d) {
            return height - yScale(d.val);
        })
        .attr('height', function (d) {
            return yScale(d.val);
        });

    bars.enter().append('rect')
        .attr('class', 'bar-rect')
        .attr('data-container', 'body')
        .attr('data-placement', dataPlacement)
        .attr('data-html', true)
        .style('pointer-events', 'none')
        .style('fill', recolorBar)
        .style('opacity', 1)
        .attr('width', barWidth)
        .attr('y', function (d) {
            return height - yScale(d.val);
        })
        .attr('height', function (d) {
            return yScale(d.val);
        });

    bars.exit().remove();

    d3Data.lastDraw = 'barChart';

}


function updateTimeBarLineChart ($el, model) {
    // debug('updating time bar: ', model);

    var width = $el.width() - margin.left - margin.right;
    var height = $el.height() - margin.top - margin.bottom;
    var d3Data = model.get('d3Data');
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
    if (d3Data.lastDraw === 'barChart') {
        debug('REMOVING');
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
    // Upper Tooltip
    //////////////////////////////////////////////////////////////////////////

    var upperTooltip = svg.selectAll('.upperTooltip');
    var pageX = model.get('pageX');
    var jquerySvg = $(svg[0]);
    var svgOffset = jquerySvg.offset();
    var adjustedX = pageX - svgOffset.left;
    var activeBin = Math.floor(xScale.invert(adjustedX));
    var upperTooltipValue = data.bins[activeBin];

    upperTooltip.attr('x', pageX)
        .text(upperTooltipValue);

    upperTooltip.data([''])
        .enter().append('text')
        .attr('class', 'upperTooltip')
        .attr('y', -5)
        .attr('x', 0)
        .attr('opacity', 1.0)
        .attr('font-size', '0.7em')
        .text('Text Data');

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
        debug('DRAWING');
        svg.append('path')
            .datum(data.bins)
            .classed('areaChart', true)
            .classed('area', true)
            .attr('d', area)
            .attr('fill', function () {
                debug('Actually doing stuff');
                debug('bin length: ', data.bins.length);
                return color(barType);
            });
    }

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
    debug('init bottom axis');

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
    debug('update bottom axis');
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







































// TODO: Export class
module.exports = TimeExplorer;

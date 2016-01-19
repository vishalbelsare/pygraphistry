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


//////////////////////////////////////////////////////////////////////////////
// CONSTANTS
//////////////////////////////////////////////////////////////////////////////

var TIME_BAR_HEIGHT = 75;
var MIN_COLUMN_WIDTH = 4;
var AXIS_HEIGHT = 20;
var BAR_SIDE_PADDING = 1;

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
    right: 10,
    bottom: 10,
    left: 10
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

function getTimeData (dataType, attr, start, stop, timeAggregation) {
    debug('getTimeDataRequest: ', dataType, attr, start, stop, timeAggregation);

    // TODO: Remove stub
    var subject = new Rx.Subject();

    var obj = {};



    var bins = Array.apply(null, new Array(200)).map(function () { return Math.floor(Math.random() * 10)   });

    obj.bins = bins;
    obj.maxBin = _.max(bins);
    obj.numBins = bins.length;
    obj.start = start;
    obj.stop = stop;
    obj.step = (stop - start) / bins.length;
    obj.attr = attr;
    obj.dataType = dataType;
    obj.timeAggregation = timeAggregation;

    if (dataType && attr) {
        obj.name = '' + dataType + ':' + attr;
    } else {
        obj.name = '_all';
    }

    setTimeout(function() {
        subject.onNext(obj);
    }, 1000);


    return subject;
}

function getMultipleTimeData (dataTypes, attr, start, stop, timeAggregation) {
    var attrPairs = _.zip(dataTypes, attr);
    attrPairs.push([null, null]); // Get all
    var subjects = _.map(attrPairs, function (data) {
        var dataType = data[0];
        var attr = data[1];
        return getTimeData(dataType, attr, start, stop, timeAggregation);
    });

    debug('subjects: ', subjects);

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


function TimeExplorer (socket, $div) {
    var that = this;
    this.$div = $div;
    this.socket = socket;

    this.panel = new TimeExplorerPanel(socket, $div);

    var now = Date.now();
    // SECONDS
    var timeDataStream = getMultipleTimeData(['point', 'point', 'point', 'edge'], ['category', 'severity', 'betweenness', 'name'], now - 200000, now, 'second');

    timeDataStream.do(function (data) {
        debug('Got time data stream: ', data);
        var dividedData = {};
        dividedData.all = data._all;
        delete data['_all'];
        dividedData.user = data;

        that.panel.model.set(dividedData);
    }).subscribe(_.identity, util.makeErrorHandler('Error getting time data stream'));

    debug('Initialized Time Explorer');
}




//////////////////////////////////////////////////////////////////////////////
// Explorer Panel
//////////////////////////////////////////////////////////////////////////////




function TimeExplorerPanel (socket, $parent) {
    var that = this;

    this.userBars = new TimeBarCollection();
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
            this.listenTo(this.model, 'change', this.render);

            var params = {};
            var html = this.template(params);
            this.$el.html(html);
            this.$el.attr('cid', this.cid);
        },

        render: function () {
            debug('rendering bottom axis panel');
            var model = this.model;
            debug('model: ', model);

            if (model.get('initialized')) {
                updateBottomAxis(model.get('axisContainer'), model);
                return this;
            }

            model.set('$el', this.$el);
            var axisContainer = this.$el.children('.axisContainer');
            model.set('axisContainer', axisContainer);
            var axisHeight = '' + AXIS_HEIGHT + 'px';
            axisContainer.height(axisHeight);
            initializeBottomAxis(axisContainer, model);
            updateBottomAxis(axisContainer, model);

            model.set('initialized', true);
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
            debug('rendering bar');
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
    var mainBarModel = new TimeBarModel({});
    this.mainBarView = new TimeBarView({model: mainBarModel});
    this.bottomAxisView = new BottomAxisView({model: new BottomAxisModel() });


    var TimeExplorerView = Backbone.View.extend({
        el: $parent,
        $timeExplorerBody: $('#timeExplorerBody'),
        $timeExplorerTop: $('#timeExplorerTop'),
        $timeExplorerMain: $('#timeExplorerMain'),
        $timeExplorerBottom: $('#timeExplorerBottom'),
        $timeExplorerAxisContainer: $('#timeExplorerAxisContainer'),
        $verticalLine: $('#timeExplorerVerticalLine'),
        userBarsView: that.userBarsView,
        mainBarView: that.mainBarView,
        bottomAxisView: that.bottomAxisView,

        events: {
            'mousemove': 'mousemove'
        },

        initialize: function () {
            // TODO: Add, remove, reset handlers
            this.listenTo(this.model, 'change', this.updateChildren);
            this.setupVerticalLine();
            this.render();


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
            debug('Updating: ', this.model);
            var data = this.model.attributes;
            var params;

            // Handle axis
            params = {
                data: data.all,
                timeStamp: Date.now()
            };
            this.bottomAxisView.model.set(params);

            // Handle main bar, '_all'
            params = {
                data: data.all,
                timeStamp: Date.now()
            };
            this.mainBarView.model.id = params.data.name;
            this.mainBarView.model.set('barType', 'main');
            this.mainBarView.model.set(params);

            var barModels = [];
            var collection = this.userBarsView.collection;

            //TODO: Update stuff that already exists instead of overwriting

            //Add new data elements
            _.each(data.user, function (val, key) {
                var barModel = new TimeBarModel();
                var params = {
                    data: val,
                    timeStamp: Date.now()
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

    this.model = new TimeExplorerModel();
    this.view = new TimeExplorerView({model: this.model});
    this.collection = this.userBars;

}


//////////////////////////////////////////////////////////////////////////////
// TIME BAR
//////////////////////////////////////////////////////////////////////////////

function initializeTimeBar ($el, model) {
    debug('initializing time bar: ', model);

    var width = $el.width() - margin.left - margin.right;
    var height = $el.height() - margin.top - margin.bottom;
    var d3Data = {};
    model.set('d3Data', d3Data);

    var svg = setupSvg($el[0], margin, width, height);

    _.extend(d3Data, {
        svg: svg
    });
}

function updateTimeBar ($el, model) {
    debug('updating time bar: ', model);

    var width = $el.width() - margin.left - margin.right;
    var height = $el.height() - margin.top - margin.bottom;
    var d3Data = model.get('d3Data');
    var data = model.get('data');
    var id = model.cid;

    var svg = d3Data.svg;

    // Guard against no data.
    // TODO: Do this more properly
    if (!data) {
        return;
    }

    var barType = model.get('barType');

    var xScale = setupBinScale(width, data.numBins)
    var yScale = setupAmountScale(height, data.maxBin, data.bins);

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
    console.log('activeBin: ', activeBin);

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

    columns.enter().append('g')
        .classed('g', true)
        .classed('column', true)
        .attr('transform', function (d, i) {
            return 'translate(' + xScale(i) + ',0)';
        }).append('rect')
            .attr('width', barWidth + BAR_SIDE_PADDING)
            .attr('height', height)
            .attr('opacity', 0);

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
            debug('color focus');
            var colorVal = color(barType + 'Focus');
            debug('colorVal: ', colorVal);
            return color(barType + 'Focus');
        } else {
            return color(barType);
        }
    };

    bars.style('fill', recolorBar);

    var dataPlacement = (data.name === '_all') ? 'all' : 'user';

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


}

function setupSvg (el, margin, width, height) {
    return d3.select(el).append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
        .append('g')
            .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
}

function prettyPrintTime(raw, timeAggregation) {
    var date = new Date(raw);

    if (timeAggregation === 'second') {
        return date.getUTCSeconds();
    }

    return date.toUTCString();
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

    debug('DATA: ', data);
    width = width - axisMargin.left - axisMargin.right;
    height = height - axisMargin.top - axisMargin.bottom;

    var xScale = setupBinScale(width, data.numBins)

    var numTicks = numBins + 1;
    var expandedTickTitles = [];
    var xAxis = d3.svg.axis()
        .scale(xScale)
        .orient('bottom')
        .ticks(numTicks)
        .tickFormat(function (d) {
            var raw = data.start + (data.step * d);
            expandedTickTitles.push(prettyPrintTime(raw));
            return prettyPrintTime(raw, data.timeAggregation)
        });

    var svg = setupSvg($el[0], axisMargin, width, height);

    svg.append('g')
        .attr('class', 'x axis')
        .attr('id', 'timexaxis-' + id)
        // .attr('transform', 'translate(')
        .call(xAxis);

    d3.select('#timexaxis-' + id)
        .selectAll('text')
        .attr('data-container', 'body')
        .attr('data-placement', 'top')
        .attr('data-toggle', 'tooltip')
        .attr('data-original-title', function (d) {
            return expandedTickTitles[d];
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









































// TODO: Export class
module.exports = TimeExplorer;

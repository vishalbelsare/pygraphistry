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

var timeExplorerUtils = require('./timeExplorerUtils.js');

//////////////////////////////////////////////////////////////////////////////
// CONSTANTS
//////////////////////////////////////////////////////////////////////////////

var axisMargin = {
    top: 1,
    right: 10,
    bottom: 10,
    left: 10
};

var AXIS_HEIGHT = 20;

//////////////////////////////////////////////////////////////////////////////
// Backbone
//////////////////////////////////////////////////////////////////////////////

var BottomAxisModel = Backbone.Model.extend({});

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

//////////////////////////////////////////////////////////////////////////////
// D3
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



module.exports = {
    model: BottomAxisModel,
    view: BottomAxisView
};


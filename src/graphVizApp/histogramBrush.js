'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:histogramBrush');
var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');
var _       = require('underscore');
var Backbone = require('backbone');
    Backbone.$ = $;
var d3 = require('d3');

var util    = require('./util.js');

var ATTRIBUTE = 'degree';
var DRAG_SAMPLE_INTERVAL = 100;

function init(socket, marquee) {
    debug('Initializing histogram brush');

    var $histogram = $('#histogram');

    // Grab global stats at initialization
    var globalStats = new Rx.ReplaySubject(1);
    var params = {all: true};
    Rx.Observable.fromCallback(socket.emit, socket)('aggregate', params)
        .map(function (reply) {
            console.log('Got global reply: ', reply.data);
            return reply.data;
        }).subscribe(globalStats, util.makeErrorHandler('Global stat aggregate call'));



    // Setup Backbone for the brushing histogram
    var HistogramModel = Backbone.Model.extend({
        defaults: function() {
            return {
                active: true
            };
        }
    });

    var HistogramCollection = Backbone.Collection.extend({
        model: HistogramModel,
        active: function() {
            return this.where({active: true});
        }
    });
    var histograms = new HistogramCollection();

    var HistogramView = Backbone.View.extend({
        tagName: 'div',
        className: 'histogramDiv',
        template: '', // TODO actually make template
        events: { // TODO do we need any?

        },
        initialize: function() {
            this.listenTo(this.model, 'change', this.render);
            this.listenTo(this.model, 'destroy', this.remove);
        },
        render: function() {
            // TODO: Do something or remove
            return this;
        }
    });

    var AllHistogramsView = Backbone.View.extend({
        el: $histogram,
        initialize: function () {
            this.listenTo(histograms, 'add', this.addHistogram);
            this.listenTo(histograms, 'reset', this.addAll);
            this.listenTo(histograms, 'all', this.render);
        },
        render: function () {
            // TODO: Use something other than visibility
            if (histograms.length > 0) {
                this.$el.css('visibility', 'visible');
            } else {
                this.$el.hide('visibility', 'hidden');
            }
        },
        addHistogram: function (histogram) {
            var view = new HistogramView({model: histogram});
            var childEl = view.render().el;
            this.$el.append(childEl);
            initializeHistogramViz($(childEl), histogram); // TODO: Link to data?
        },
        addAll: function () {
            this.$el.empty();
            histograms.each(this.addHistogram, this);
        }
    });
    new AllHistogramsView();

    // Initial drag + drop
    marquee.selections.flatMapLatest(function (sel) {
        return globalStats.map(function (val) {
            return {sel: sel, globalStats: val};
        });
    }).flatMap(function (data) {
        console.log('Firing brush selection: ', data.sel);
        var binning = data.globalStats[ATTRIBUTE];
        var params = {sel: data.sel, attribute: ATTRIBUTE, binning: binning};
        return Rx.Observable.fromCallback(socket.emit, socket)('aggregate', params)
            .map(function (agg) {
                return {reply: agg, sel: data.sel, globalStats: data.globalStats};
            });
    }).do(function (data) {
        if (!data.reply) {
            console.error('Unexpected server error on aggregate');
        } else if (data.reply && !data.reply.success) {
            console.log('Server replied with error:', data.reply.error);
        }
    // TODO: Do we want to treat no replies in some special way?
    }).filter(function (data) { return data.reply && data.reply.success; })
    .map(function (data) {
        // TODO: Massage this into a format we want.
        // TODO: Deal with nodata responses cleanly
        return data;
    }).do(function (data) {
        console.log('Creating Histogram with: ', data.reply.data[ATTRIBUTE]);
        updateHistogramData(socket, marquee, histograms, data.reply.data[ATTRIBUTE], data.globalStats);
    }).subscribe(_.identity, util.makeErrorHandler('Brush selection aggregate error'));


    // Updates from brushing
    marquee.drags.sample(DRAG_SAMPLE_INTERVAL)
    .do(function (dragData) {
        console.log('Got drag data: ', dragData);
    }).subscribe(_.identity, util.makeErrorHandler('Brush drag aggregate error'));

}


function initializeHistogramViz($el, model) {
    var width = $el.width();
    var height = $el.parent().height(); // TODO: Get this more naturally.
    var data = model.attributes.data;
    var globalStats = model.attributes.globalStats[ATTRIBUTE];
    var bins = data.bins || []; // Guard against empty bins.
    var globalBins = globalStats.bins || [];

    // Transform bins and global bins into stacked format.
    console.log('Bins: ', bins);
    // TODO: Get this in a cleaner, more extensible way
    var stackedBins = _.zip(bins, globalBins); // [[0,2], [1,4], ... ]
    _.each(stackedBins, function (stack, idx) {
        var local = stack[0] || 0;
        var total = stack[1];
        var stackedObj = [
                {y0: 0, y1: local, val: local, type: 'local'},
                {y0: local, y1: total, val: total, type: 'global'}
        ];
        stackedObj.total = total;
        stackedBins[idx] = stackedObj;
    });
    console.log('Stacked Bins: ', stackedBins);


    var margin = {top: 10, right: 10, bottom: 20, left:40};
    width = width - margin.left - margin.right;
    height = height - margin.top - margin.bottom;

    var color = d3.scale.ordinal()
            .range(['#0FA5C5', '#B2B2B2'])
            .domain(['local', 'global']);

    // TODO: Make these align between bars
    var xScale = d3.scale.linear()
        .range([0, width]);

    var yScale = d3.scale.linear()
        .range([height, 0]);

    var xAxis = d3.svg.axis()
        .scale(xScale)
        .orient('bottom')
        .ticks(globalStats.numBins + 1)
        .tickFormat(function (d) {
            return d * globalStats.binWidth + globalStats.minValue;
        });

    var yAxis = d3.svg.axis()
        .scale(yScale)
        .ticks(5) // TODO: Dynamic?
        .orient('left'); // TODO: format?

    var svg = d3.select($el[0]).append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
        .append('g')
            .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    // TODO: Make this correct values
    xScale.domain([0, globalStats.numBins]);

    var yDomainMax = _.max(stackedBins, function (bin) {
        return bin.total;
    }).total;

    console.log('yDomainMax: ', yDomainMax);
    yScale.domain([0, yDomainMax]);

    svg.append('g')
        .attr('class', 'x axis')
        .attr('transform', 'translate(0,' + height + ')')
        .call(xAxis);

    svg.append('g')
        .attr('class', 'y axis')
        .call(yAxis);

    var columns = svg.selectAll('.bar')
            .data(stackedBins)
        .enter().append('g')
            .attr('class', 'g')
            .attr('transform', function (d, i) {
                return 'translate(' + xScale(i) + ',0)';
            });

    columns.selectAll('rect')
            // TODO: Remove this
            .data(function (d) {
                return d;
            })
        .enter().append('rect')
            .attr('width', Math.floor(width/globalStats.numBins))
            .attr('height', function (d) {
                console.log(d);
                return yScale(d.y0) - yScale(d.y1);
            })
            .attr('y', function (d) {
                return yScale(d.y1);
            })
            .style('fill', function (d) {
                return color(d.type);
            });



    // svg.selectAll('.bar')
    //         .data(stackedBins)
    //     .enter().append('rect')
    //         .attr('class', 'bar')
    //         .attr('x', function (d, i) {
    //             return xScale(i);
    //         })
    //         .attr('width', Math.floor(width/data.numBins))
    //         .attr('y', function (d) {
    //             return yScale(d);
    //         })
    //         .attr('height', function (d) {
    //             return height - yScale(d);
    //         });



}


function updateHistogramData(socket, marquee, collection, data, globalStats) {
    collection.reset([{data: data, globalStats: globalStats}]);
}

module.exports = {
    init: init
};

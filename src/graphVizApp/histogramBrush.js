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
var DRAG_SAMPLE_INTERVAL = 300;

// GLOBALS for updates
var svg;
var xScale;
var yScale;
var color;

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
            updateHistogram($(childEl), histogram);
        },
        addAll: function () {
            this.$el.empty();
            histograms.each(this.addHistogram, this);
        }
    });
    new AllHistogramsView();

    // Initial drag + drop
    marquee.selections.map(function (val) {
        return {type: 'selection', sel: val};
    }).merge(marquee.drags.sample(DRAG_SAMPLE_INTERVAL).map(function (val) {
            return {type: 'drag', sel: val};
        })
    ).flatMapLatest(function (selContainer) {
        return globalStats.map(function (globalVal) {
            return {type: selContainer.type, sel: selContainer.sel, globalStats: globalVal};
        });
    }).flatMap(function (data) {
        console.log('Firing brush selection: ', data.sel);
        var binning = data.globalStats[ATTRIBUTE];
        var params = {sel: data.sel, attribute: ATTRIBUTE, binning: binning};
        return Rx.Observable.fromCallback(socket.emit, socket)('aggregate', params)
            .map(function (agg) {
                return {reply: agg, sel: data.sel, globalStats: data.globalStats, type: data.type};
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
        console.log('DATA:', data);
        console.log('Creating Histogram with: ', data.reply.data[ATTRIBUTE]);

        if (data.type === 'selection') {
            createHistogramData(socket, marquee, histograms, data.reply.data[ATTRIBUTE], data.globalStats);
        } else if (data.type === 'drag') {
            updateHistogramData(socket, marquee, histograms, data.reply.data[ATTRIBUTE], data.globalStats);
        }

    }).subscribe(_.identity, util.makeErrorHandler('Brush selection aggregate error'));


    // Updates from brushing
    marquee.drags.sample(DRAG_SAMPLE_INTERVAL)
    .do(function (dragData) {
        console.log('Got drag data: ', dragData);
    }).subscribe(_.identity, util.makeErrorHandler('Brush drag aggregate error'));

}

function toStackedBins(bins, globalBins) {
    // Transform bins and global bins into stacked format.
    // TODO: Get this in a cleaner, more extensible way
    var stackedBins = _.zip(bins, globalBins); // [[0,2], [1,4], ... ]
    _.each(stackedBins, function (stack, idx) {
        var local = stack[0] || 0;
        var total = stack[1];
        var stackedObj = [
                {y0: 0, y1: local, val: local, type: 'local', binId: idx},
                {y0: local, y1: total, val: total, type: 'global', binId: idx}
        ];
        stackedObj.total = total;
        stackedObj.id = idx;
        stackedBins[idx] = stackedObj;
    });
    return stackedBins;
}

function updateHistogram($el, model) {
    var width = $el.width();
    var data = model.attributes.data;
    var globalStats = model.attributes.globalStats[ATTRIBUTE];
    var bins = data.bins || []; // Guard against empty bins.
    var globalBins = globalStats.bins || [];

    // Transform bins and global bins into stacked format.
    // TODO: Get this in a cleaner, more extensible way
    var stackedBins = toStackedBins(bins, globalBins);

    var columns = svg.selectAll('.column')
        .data(stackedBins, function (d) {
            return d.id;
        });


    columns.enter().append('g')
        .attr('class', 'g')
        .attr('class', 'column')
        .attr('transform', function (d, i) {
            console.log('Entering Column');
            return 'translate(' + xScale(i) + ',0)';
        });

    //////////////////////////////////////////////////////////////////
    // COLUMN UPDATE SELECTION

    // Update bars in existing columns
    var bars = columns.selectAll('rect')
        .data(function (d) {
            return d;
        }, function (d) {
            return d.type + d.binId;
        });

    // Update

    bars
        // .transition().duration(DRAG_SAMPLE_INTERVAL)
        .attr('height', function (d) {
            console.log('UPDATING BAR');
            return yScale(d.y0) - yScale(d.y1);
        })
        .attr('y', function (d) {
            return yScale(d.y1);
        });

    // Enter

    bars.enter().append('rect')
        // .transition().duration(DRAG_SAMPLE_INTERVAL)
        .style('fill', function (d) {
            console.log('ENTERING BAR');
            return color(d.type);
        })
        .attr('width', Math.floor(width/globalStats.numBins))
        .attr('height', function (d) {
            return yScale(d.y0) - yScale(d.y1);
        })
        .attr('y', function (d) {
            return yScale(d.y1);
        });


    // Exit
    // NO OP



    // applyBarAttr(bars.enter().append('rect').transition().duration(DRAG_SAMPLE_INTERVAL).attr('class', function (d) {
    //     console.log('Entering');
    //     return 'blah';
    // }));
    // applyBarAttr(bars.transition().duration(DRAG_SAMPLE_INTERVAL));
}


function initializeHistogramViz($el, model) {
    var width = $el.width();
    var height = $el.parent().height(); // TODO: Get this more naturally.
    var data = model.attributes.data;
    var globalStats = model.attributes.globalStats[ATTRIBUTE];
    var bins = data.bins || []; // Guard against empty bins.
    var globalBins = globalStats.bins || [];

    // Transform bins and global bins into stacked format.
    // TODO: Get this in a cleaner, more extensible way
    var stackedBins = toStackedBins(bins, globalBins);

    var margin = {top: 10, right: 10, bottom: 20, left:40};
    width = width - margin.left - margin.right;
    height = height - margin.top - margin.bottom;

    color = d3.scale.ordinal()
            .range(['#0FA5C5', '#B2B2B2'])
            .domain(['local', 'global']);

    // TODO: Make these align between bars
    xScale = d3.scale.linear()
        .range([0, width]);

    yScale = d3.scale.linear()
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

    svg = d3.select($el[0]).append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
        .append('g')
            .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    // TODO: Make this correct values
    xScale.domain([0, globalStats.numBins]);

    var yDomainMax = _.max(stackedBins, function (bin) {
        return bin.total;
    }).total;

    yScale.domain([0, yDomainMax]);

    svg.append('g')
        .attr('class', 'x axis')
        .attr('transform', 'translate(0,' + height + ')')
        .call(xAxis);

    svg.append('g')
        .attr('class', 'y axis')
        .call(yAxis);

}


function createHistogramData(socket, marquee, collection, data, globalStats) {
    collection.reset([{data: data, globalStats: globalStats, firstTime: true}]);
}

function updateHistogramData(socket, marquee, collection, data, globalStats ) {
    collection.reset([{data: data, globalStats: globalStats, firstTime: false}]);
}

module.exports = {
    init: init
};

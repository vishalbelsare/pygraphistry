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

// GLOBALS for updates
var svg;
var xScale;
var yScale;
var color;
var margin = {top: 10, right: 10, bottom: 20, left:40};

function init(socket, marquee) {
    debug('Initializing histogram brush');

    var $histogram = $('#histogram');

    // Grab global stats at initialization
    var globalStats = new Rx.ReplaySubject(1);
    var params = {all: true};
    Rx.Observable.fromCallback(socket.emit, socket)('aggregate', params)
        .map(function (reply) {
            console.log('Global Histogram Stats: ', reply);
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
            this.listenTo(histograms, 'change', this.update);
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
            histogram.set('$el', $(childEl));
            initializeHistogramViz($(childEl), histogram); // TODO: Link to data?
            updateHistogram($(childEl), histogram, histogram.get('attribute'));
        },
        update: function (histogram) {
            // TODO: Find way to not fire this on first time
            if (!histogram.get('firstTime')) {
                updateHistogram(histogram.get('$el'), histogram, histogram.get('attribute'));
            }
        },
        addAll: function () {
            this.$el.empty();
            histograms.each(this.addHistogram, this);
        }
    });
    new AllHistogramsView();


    marquee.selections.map(function (val) {
        return {type: 'selection', sel: val};
    }).merge(marquee.drags.sample(DRAG_SAMPLE_INTERVAL).map(function (val) {
            return {type: 'drag', sel: val};
        })
    ).flatMapLatest(function (selContainer) {
        return globalStats.map(function (globalVal) {
            return {type: selContainer.type, sel: selContainer.sel, globalStats: globalVal};
        });
    }).flatMapLatest(function (data) {
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
    .do(function (data) {
        if (data.type === 'selection') {
            createHistogramData(socket, marquee, histograms, data.reply.data, data.globalStats, HistogramModel);
        } else if (data.type === 'drag') {
            updateHistogramData(socket, marquee, histograms, data.reply.data, data.globalStats, HistogramModel);
        }

    }).subscribe(_.identity, util.makeErrorHandler('Brush selection aggregate error'));

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

function updateHistogram($el, model, attribute) {
    var width = $el.width() - margin.left - margin.right;
    var data = model.attributes.data;
    var globalStats = model.attributes.globalStats[attribute];
    var bins = data.bins || []; // Guard against empty bins.
    var globalBins = globalStats.bins || [];


    var stackedBins = toStackedBins(bins, globalBins);

    var columns = svg.selectAll('.column')
        .data(stackedBins, function (d) {
            return d.id;
        });

    columns.enter().append('g')
        .attr('class', 'g')
        .attr('class', 'column')
        .attr('transform', function (d, i) {
            return 'translate(' + xScale(i) + ',0)';
        });


    var bars = columns.selectAll('rect')
        .data(function (d) {
            return d;
        }, function (d) {
            return d.type + d.binId;
        });

    bars
        .transition().duration(DRAG_SAMPLE_INTERVAL)
        .attr('height', function (d) {
            return yScale(d.y0) - yScale(d.y1) + heightDelta(d);
        })
        .attr('y', function (d) {
            return yScale(d.y1) - heightDelta(d);
        });


    bars.enter().append('rect')
        .style('fill', function (d) {
            return color(d.type);
        })
        .attr('width', Math.floor(width/globalStats.numBins))
        .attr('height', function (d) {
            return yScale(d.y0) - yScale(d.y1) + heightDelta(d);
        })
        .attr('y', function (d) {
            return yScale(d.y1) - heightDelta(d);
        });
}

function heightDelta(d) {
    var minimumHeight = 4;
    var height = yScale(d.y0) - yScale(d.y1);
    if (d.val > 0 && d.y0 === 0 && height < minimumHeight) {
       return minimumHeight - height;
    } else {
        return 0;
    }
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


function createHistogramData(socket, marquee, collection, data, globalStats, Model) {
    _.each(data, function (val, key) {
        var histogram = new Model();
        histogram.set({data: val, globalStats: globalStats, firstTime: true});
        histogram.id = key;
        histogram.set('attribute', key);
        collection.reset([histogram]);
    });
}

function updateHistogramData(socket, marquee, collection, data, globalStats, Model ) {
    _.each(data, function (val, key) {
        var histogram = new Model();
        histogram.set({data: val, globalStats: globalStats, firstTime: false});
        histogram.id = key;
        histogram.set('attribute', key);
        collection.set([histogram]);
    });
}

module.exports = {
    init: init
};

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
    // var allHistograms = new AllHistogramsView();
    new AllHistogramsView();

    marquee.selections.flatMap(function (sel) {
        console.log('Firing brush selection: ', sel);
        var params = {sel: sel, attribute: ATTRIBUTE};
        return Rx.Observable.fromCallback(socket.emit, socket)('aggregate', params);
    }).do(function (reply) {
        if (!reply) {
            console.error('Unexpected server error on aggregate');
        } else if (reply && !reply.success) {
            console.log('Server replied with error:', reply.error);
        }
    // TODO: Do we want to treat no replies in some special way?
    }).filter(function (reply) { return reply && reply.success; })
    .map(function (reply) {
        // TODO: Massage this into a format we want.
        return reply.data[ATTRIBUTE];
    }).do(function (data) {
        updateHistogramData(socket, marquee, histograms, data);
    }).subscribe(_.identity, util.makeErrorHandler('Brush selection aggregate error'));

    marquee.drags.sample(DRAG_SAMPLE_INTERVAL)
    .do(function (dragData) {
        console.log('Got drag data: ', dragData);
    }).subscribe(_.identity, util.makeErrorHandler('Brush drag aggregate error'));

}


function initializeHistogramViz($el, model) {
    var width = $el.width();
    var height = $el.parent().height(); // TODO: Get this more naturally.
    var data = model.attributes;
    var bins = data.bins || []; // Guard against empty bins.

    var margin = {top: 10, right: 10, bottom: 20, left:40};
    width = width - margin.left - margin.right;
    height = height - margin.top - margin.bottom;

    // TODO: Make these align between bars
    var xScale = d3.scale.linear()
        .range([0, width]);

    var yScale = d3.scale.linear()
        .range([height, 0]);

    var xAxis = d3.svg.axis()
        .scale(xScale)
        .orient('bottom')
        .ticks(data.numBins + 1)
        .tickFormat(function (d) {
            return d * data.binWidth + data.minValue;
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
    xScale.domain([0, data.numBins]);

    var yDomainMax = (bins.length > 0) ? d3.max(bins) : 1; // Guard against zero items.
    yScale.domain([0, yDomainMax]);

    svg.append('g')
        .attr('class', 'x axis')
        .attr('transform', 'translate(0,' + height + ')')
        .call(xAxis);

    svg.append('g')
        .attr('class', 'y axis')
        .call(yAxis);

    svg.selectAll('.bar')
            .data(bins)
        .enter().append('rect')
            .attr('class', 'bar')
            .attr('x', function (d, i) {
                return xScale(i);
            })
            .attr('width', Math.floor(width/data.numBins))
            .attr('y', function (d) {
                return yScale(d);
            })
            .attr('height', function (d) {
                return height - yScale(d);
            });
}


function updateHistogramData(socket, marquee, collection, data) {
    collection.reset([data]);
}

module.exports = {
    init: init
};

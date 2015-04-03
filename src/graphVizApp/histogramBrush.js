'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:histogramBrush');
var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');
var _       = require('underscore');
var Handlebars = require('handlebars');
var Backbone = require('backbone');
    Backbone.$ = $;
var d3 = require('d3');

var util    = require('./util.js');


//////////////////////////////////////////////////////////////////////////////
// CONSTANTS
//////////////////////////////////////////////////////////////////////////////

// var ATTRIBUTE = 'community_infomap';
var ATTRIBUTE = 'degree';
// var MODE = 'countBy';
var MODE = 'default';
var DIST = false;
var DRAG_SAMPLE_INTERVAL = 100;
var NUM_BINS_VISIBLE = 20;

//////////////////////////////////////////////////////////////////////////////
// Globals for updates
//////////////////////////////////////////////////////////////////////////////

var svg;
var xScale;
var yScale;
var color;
var colorHighlighted;
var margin = {top: 10, right: 10, bottom: 20, left:40};
var lastSelection;
var attributeChange = new Rx.Subject();

function updateAttribute (newAttribute) {
    ATTRIBUTE = newAttribute;
    attributeChange.onNext(newAttribute);
}

function init(socket, marquee) {
    debug('Initializing histogram brush');
    window.updateAttribute = updateAttribute;

    //////////////////////////////////////////////////////////////////////////
    // Backbone views and models
    //////////////////////////////////////////////////////////////////////////

    var $histogram = $('#histogram');

    // Setup Backbone for the brushing histogram
    var HistogramModel = Backbone.Model.extend({});

    var HistogramCollection = Backbone.Collection.extend({
        model: HistogramModel
    });
    var histograms = new HistogramCollection();

    var HistogramView = Backbone.View.extend({
        tagName: 'div',
        className: 'histogramDiv',
        template: Handlebars.compile($('#histogramTemplate').html()),
        initialize: function() {
            this.listenTo(this.model, 'destroy', this.remove);
        },
        render: function() {
            var fields = _.filter(_.keys(this.model.get('globalStats')), function (val) {
                return val !== '_title';
            });

            var params = {
                fields: fields,
                attribute: ATTRIBUTE,
                id: this.cid
            };
            var html = this.template(params);
            this.$el.html(html);

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
                this.$el.css('visibility', 'hidden');
            }
        },
        addHistogram: function (histogram) {
            var view = new HistogramView({model: histogram});
            var childEl = view.render().el;
            this.$el.append(childEl);
            histogram.set('$el', $(childEl));
            var vizContainer = $(childEl).children('.vizContainer');
            initializeHistogramViz(vizContainer, histogram); // TODO: Link to data?
            updateHistogram(vizContainer, histogram, histogram.get('attribute'));
        },
        update: function (histogram) {
            // TODO: Find way to not fire this on first time
            if (!histogram.get('firstTime')) {
                updateHistogram(histogram.get('$el').children('.vizContainer'), histogram, histogram.get('attribute'));
            }
        },
        addAll: function () {
            this.$el.empty();
            histograms.each(this.addHistogram, this);
        }
    });
    new AllHistogramsView();


    //////////////////////////////////////////////////////////////////////////
    // Setup Streams
    //////////////////////////////////////////////////////////////////////////

    // Grab global stats at initialization
    var globalStats = new Rx.ReplaySubject(1);
    var params = {all: true, mode: MODE};
    Rx.Observable.fromCallback(socket.emit, socket)('aggregate', params)
        .map(function (reply) {
            return reply.data;
        }).subscribe(globalStats, util.makeErrorHandler('Global stat aggregate call'));

    // Take stream of selections and drags and use them for histograms
    marquee.selections.map(function (val) {
        return {type: 'selection', sel: val};
    }).merge(marquee.drags.sample(DRAG_SAMPLE_INTERVAL).map(function (val) {
            return {type: 'drag', sel: val};
        })
    ).merge(attributeChange.map(function () {
            return {type: 'attributeChange', sel: lastSelection};
        })
    ).flatMapLatest(function (selContainer) {
        return globalStats.map(function (globalVal) {
            return {type: selContainer.type, sel: selContainer.sel, globalStats: globalVal};
        });

    }).flatMapLatest(function (data) {
        var binning = data.globalStats[ATTRIBUTE];
        var params = {sel: data.sel, attribute: ATTRIBUTE, binning: binning, mode: MODE};
        lastSelection = data.sel;
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
        if (data.type === 'selection' || data.type === 'attributeChange') {
            updateHistogramData(socket, marquee, histograms, data.reply.data, data.globalStats, HistogramModel, true);
        } else if (data.type === 'drag') {
            updateHistogramData(socket, marquee, histograms, data.reply.data, data.globalStats, HistogramModel, false);
        }

    }).subscribe(_.identity, util.makeErrorHandler('Brush selection aggregate error'));

    //////////////////////////////////////////////////////////////////////////
    // General Setup
    //////////////////////////////////////////////////////////////////////////

    $('#histogram').on('click', '.histogramDropdownField', function(){
        var field = $(this).text().trim();
        $(this).parents('.dropdown').find('.btn').text(field);
        $(this).parents('.dropdown').find('.btn').val(field);
        updateAttribute(field);
    });


}

function toStackedObject(local, total, idx, key, numLocal, numTotal) {
    // If we want to normalize to a distribution as percentage of total.
    var stackedObj;
    if (DIST) {
        local = (numLocal === 0) ? 0 : local / numLocal;
        total = (numTotal === 0) ? 0 : total / numTotal;

        if (local <= total) {
            stackedObj = [
                {y0: 0, y1: local, val: local, type: 'local', binId: idx, barNum: 0},
                {y0: local, y1: total, val: total, type: 'global', binId: idx, barNum: 1}
            ];
        } else {
            stackedObj = [
                {y0: 0, y1: total, val: total, type: 'globalSmaller', binId: idx, barNum: 1},
                {y0: total, y1: local, val: local, type: 'localBigger', binId: idx, barNum: 0}
            ];
        }

    } else {
        stackedObj = [
            {y0: 0, y1: local, val: local, type: 'local', binId: idx, barNum: 0},
            {y0: local, y1: total, val: total, type: 'global', binId: idx, barNum: 1}
        ];
    }

    stackedObj.total = Math.max(total, local);
    stackedObj.name = key;
    stackedObj.id = idx;
    return stackedObj;
}

function toStackedBins(bins, globalBins, type, numLocal, numTotal) {
    // Transform bins and global bins into stacked format.
    // Assumes that globalBins is always a superset of bins
    // TODO: Get this in a cleaner, more extensible way
    var stackedBins = [];
    if (type === 'countBy') {
        var globalKeys = _.keys(globalBins);
        _.each(globalKeys, function (key, idx) {
            var local = bins[key] || 0;
            var total = globalBins[key];
            var stackedObj = toStackedObject(local, total, idx, key, numLocal, numTotal);
            stackedBins.push(stackedObj);
        });

    } else {
        var zippedBins = _.zip(bins, globalBins); // [[0,2], [1,4], ... ]
        _.each(zippedBins, function (stack, idx) {
            var local = stack[0] || 0;
            var total = stack[1];
            var stackedObj = toStackedObject(local, total, idx, '', numLocal, numTotal);
            stackedBins.push(stackedObj);
        });
    }
    return stackedBins;
}


function highlight(selection, toggle) {
    _.each(selection[0], function (sel) {
        var colorScale = (toggle) ? colorHighlighted : color;
        var data = sel.__data__;
        $(sel).css('fill', colorScale(data.type));
    });
}

function updateHistogram($el, model, attribute) {
    var width = $el.width() - margin.left - margin.right;
    var data = model.attributes.data;
    var globalStats = model.attributes.globalStats[attribute];
    var bins = data.bins || []; // Guard against empty bins.
    var globalBins = globalStats.bins || [];
    var type = (data.type !== 'nodata') ? data.type : globalStats.type;
    data.numValues = data.numValues || 0;

    var stackedBins = toStackedBins(bins, globalBins, type, data.numValues, globalStats.numValues);

    if (globalStats.numBins < NUM_BINS_VISIBLE) {
        width = Math.floor((globalStats.numBins/NUM_BINS_VISIBLE) * width);
    }

    //////////////////////////////////////////////////////////////////////////
    // Create Columns
    //////////////////////////////////////////////////////////////////////////

    var columns = svg.selectAll('.column')
        .data(stackedBins, function (d) {
            return d.id;
        });

    columns.enter().append('g')
        .classed('g', true)
        .classed('column', true)
        .attr('transform', function (d, i) {
            return 'translate(' + xScale(i) + ',0)';
        })
        .attr('data-container', '#histogram')
        .attr('data-placement', 'top')
        .attr('data-toggle', 'tooltip')
        .attr('title', function(d) {
            return d.total;
        })
        .on('mouseover', function () {
            var col = d3.select(d3.event.target.parentNode);
            $(col).tooltip('show');
            highlight(col.selectAll('rect'), true);
        })
        .on('mouseout', function () {
            var col = d3.select(d3.event.target.parentNode);
            $(col).tooltip('hide');
            highlight(col.selectAll('rect'), false);
        });

    //////////////////////////////////////////////////////////////////////////
    // Create and Update Bars
    //////////////////////////////////////////////////////////////////////////

    var bars = columns.selectAll('rect')
        .data(function (d) {
            return d;
        }, function (d) {
            return d.barNum + d.binId;
        });

    bars
        .transition().duration(DRAG_SAMPLE_INTERVAL)
        .attr('height', function (d) {
            return yScale(d.y0) - yScale(d.y1) + heightDelta(d);
        })
        .attr('y', function (d) {
            return yScale(d.y1) - heightDelta(d);
        });

    var barWidth = (type === 'countBy') ? xScale.rangeBand() : Math.floor(width/globalStats.numBins);
    bars.enter().append('rect')
        .style('fill', function (d) {
            return color(d.type);
        })
        .attr('width', barWidth)
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
    var height = $el.height(); // TODO: Get this more naturally.
    var data = model.attributes.data;
    var globalStats = model.attributes.globalStats[ATTRIBUTE];
    var bins = data.bins || []; // Guard against empty bins.
    var globalBins = globalStats.bins || [];
    var type = (data.type !== 'nodata') ? data.type : globalStats.type;
    data.numValues = data.numValues || 0;

    // Transform bins and global bins into stacked format.
    var stackedBins = toStackedBins(bins, globalBins, type, data.numValues, globalStats.numValues);

    //////////////////////////////////////////////////////////////////////////
    // Scale size of SVG / viz based on number of elements.
    //////////////////////////////////////////////////////////////////////////

    width = width - margin.left - margin.right;
    height = height - margin.top - margin.bottom;

    if (globalStats.numBins < NUM_BINS_VISIBLE) {
        width = Math.floor((globalStats.numBins/NUM_BINS_VISIBLE) * width);
    }

    //////////////////////////////////////////////////////////////////////////
    // Setup Scales and Axes
    //////////////////////////////////////////////////////////////////////////

    color = d3.scale.ordinal()
            .range(['#0FA5C5', '#B2B2B2', '#0FA5C5', '#00BBFF'])
            // .range(['#0092DC', '#B2B2B2'])
            .domain(['local', 'global', 'globalSmaller', 'localBigger']);

    colorHighlighted = d3.scale.ordinal()
            .range(['#E35E13', '#6B6868', '#E35E13', '#FF3000'])
            .domain(['local', 'global', 'globalSmaller', 'localBigger']);

    // We want ticks between bars if histogram, and under bars if countBy
    if (type === 'countBy') {
        xScale = d3.scale.ordinal()
            .rangeRoundBands([0, width], 0.1, 0.1);
    } else {
        xScale = d3.scale.linear()
            .range([0, width]);
    }

    yScale = d3.scale.linear()
        .range([height, 0]);

    if (type === 'countBy') {
        xScale.domain(_.range(globalStats.numBins));
    } else {
        xScale.domain([0, globalStats.numBins]);
    }

    var yDomainMax = _.max(stackedBins, function (bin) {
        return bin.total;
    }).total;

    if (DIST) {
        yDomainMax = 1.0;
    }

    yScale.domain([0, yDomainMax]);

    var numTicks = (type === 'countBy') ? globalStats.numBins : globalStats.numBins + 1;
    var xAxis = d3.svg.axis()
        .scale(xScale)
        .orient('bottom')
        .ticks(numTicks)
        .tickFormat(function (d) {
            if (type === 'countBy') {
                return d; // name of bin
            } else {
                return d * globalStats.binWidth + globalStats.minValue;
            }
        });

    var yAxis = d3.svg.axis()
        .scale(yScale)
        .ticks(5) // TODO: Dynamic?
        .orient('left'); // TODO: format?

    //////////////////////////////////////////////////////////////////////////
    // Setup SVG
    //////////////////////////////////////////////////////////////////////////

    svg = d3.select($el[0]).append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
        .append('g')
            .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    svg.append('g')
        .attr('class', 'x axis')
        .attr('transform', 'translate(0,' + height + ')')
        .call(xAxis);

    svg.append('g')
        .attr('class', 'y axis')
        .call(yAxis);
}

function updateHistogramData(socket, marquee, collection, data, globalStats, Model, firstTime) {
    _.each(data, function (val, key) {
        var histogram = new Model();
        histogram.set({data: val, globalStats: globalStats, firstTime: firstTime});
        histogram.id = key;
        histogram.set('attribute', key);
        if (firstTime) {
            collection.reset([histogram]);
        } else {
            collection.set([histogram]);
        }
    });
}

module.exports = {
    init: init
};

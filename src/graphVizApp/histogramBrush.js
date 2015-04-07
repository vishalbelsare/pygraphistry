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

// var MODE = 'countBy';
var MODE = 'default';
var DIST = false;
var DRAG_SAMPLE_INTERVAL = 100;
var BAR_THICKNESS = 16;

//////////////////////////////////////////////////////////////////////////////
// Globals for updates
//////////////////////////////////////////////////////////////////////////////

var color = d3.scale.ordinal()
        .range(['#0FA5C5', '#B2B2B2', '#0FA5C5', '#00BBFF'])
        // .range(['#0092DC', '#B2B2B2'])
        .domain(['local', 'global', 'globalSmaller', 'localBigger']);

var colorHighlighted = d3.scale.ordinal()
        .range(['#E35E13', '#6B6868', '#E35E13', '#FF3000'])
        .domain(['local', 'global', 'globalSmaller', 'localBigger']);

var margin = {top: 10, right: 70, bottom: 20, left:20};
var lastSelection;
var attributes = [];
var activeAttributes = [];
var attributeChange = new Rx.Subject();

function updateAttribute (oldAttribute, newAttribute) {
    console.log('Updating. Old: ', oldAttribute, ', new: ', newAttribute);
    console.log('activeAttributes: ', activeAttributes);
    // Delete old if it exists
    var indexOfOld = activeAttributes.indexOf(oldAttribute);
    if (indexOfOld > -1) {
        activeAttributes.splice(indexOfOld, 1);
    }

    // Add new one if it exists
    if (newAttribute) {
        activeAttributes.push(newAttribute);
    }
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
            var params = {
                fields: attributes,
                attribute: this.model.attributes.attribute,
                id: this.cid
            };
            var html = this.template(params);
            this.$el.html(html);

            return this;
        }
    });

    var AllHistogramsView = Backbone.View.extend({
        el: $histogram,
        histogramsContainer: $('#histograms'),
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
            $(this.histogramsContainer).append(childEl);
            histogram.set('$el', $(childEl));
            var vizContainer = $(childEl).children('.vizContainer');
            var vizHeight = histogram.get('data').numBins * BAR_THICKNESS;
            vizContainer.height(String(vizHeight) + 'px');
            initializeHistogramViz(vizContainer, histogram); // TODO: Link to data?
            updateHistogram(vizContainer, histogram, histogram.get('attribute'));
        },
        update: function (histogram) {
            // TODO: Find way to not fire this on first time
            if (!histogram.get('firstTime')) {
                histograms.each(function (histogram) {
                    updateHistogram(histogram.get('$el').children('.vizContainer'), histogram, histogram.get('attribute'));
                });
            }
        },
        addAll: function () {
            $(this.histogramsContainer).empty();
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
        })
        .do(function (data) {
            attributes = _.filter(_.keys(data), function (val) {
                return val !== '_title';
            });
            activeAttributes = attributes.slice(0,3);
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
        var binning = data.globalStats;
        var params = {sel: data.sel, attributes: activeAttributes, binning: binning, mode: MODE};
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

    $('#histogram').on('click', '.histogramDropdownField', function() {
        // TODO: Get this value in a cleaner way
        var oldField = $(this).parent().parent().siblings('button').text().trim();
        var field = $(this).text().trim();
        $(this).parents('.dropdown').find('.btn').text(field);
        $(this).parents('.dropdown').find('.btn').val(field);
        updateAttribute(oldField, field);
        console.log('Active Attributes after: ', activeAttributes);
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
            // We do a max because sometimes we get incorrect global values that are slightly too small
            {y0: 0, y1: local, val: local, type: 'local', binId: idx, barNum: 0},
            {y0: local, y1: Math.max(total, local), val: total, type: 'global', binId: idx, barNum: 1}
        ];
    }

    stackedObj.total = total;
    stackedObj.local = local;
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
    var height = $el.height() - margin.top - margin.bottom;
    var data = model.attributes.data;
    var globalStats = model.attributes.globalStats[attribute];
    var bins = data.bins || []; // Guard against empty bins.
    var globalBins = globalStats.bins || [];
    var type = (data.type !== 'nodata') ? data.type : globalStats.type;
    data.numValues = data.numValues || 0;

    var svg = model.get('svg');
    var xScale = model.get('xScale');
    var yScale = model.get('yScale');

    var stackedBins = toStackedBins(bins, globalBins, type, data.numValues, globalStats.numValues);

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
            // return 'translate(' + xScale(i) + ',0)';
            return 'translate(0,' + yScale(i) + ')';
        })

        .attr('data-container', '#histogram')
        .attr('data-placement', 'top')
        .attr('data-toggle', 'tooltip')
        .attr('data-original-title', function(d) {
            return d.total;
        })

        .on('mouseover', function () {
            var col = d3.select(d3.event.target.parentNode);
            var children = col[0][0].children;
            _.each(children, function (child) {
                $(child).tooltip('fixTitle');
                $(child).tooltip('show');
            });
            highlight(col.selectAll('rect'), true);
        })
        .on('mouseout', function () {
            var col = d3.select(d3.event.target.parentNode);
            var children = col[0][0].children;
            _.each(children, function (child) {
                $(child).tooltip('hide');
            });
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

    // bars
    //     .transition().duration(DRAG_SAMPLE_INTERVAL)
    //     .attr('height', function (d) {
    //         return yScale(d.y0) - yScale(d.y1) + heightDelta(d);
    //     })
    //     .attr('y', function (d) {
    //         return yScale(d.y1) - heightDelta(d);
    //     });

    // var barWidth = (type === 'countBy') ? xScale.rangeBand() : Math.floor(width/globalStats.numBins);
    // bars.enter().append('rect')
    //     .style('fill', function (d) {
    //         return color(d.type);
    //     })
    //     .attr('width', barWidth)
    //     .attr('height', function (d) {
    //         return yScale(d.y0) - yScale(d.y1) + heightDelta(d);
    //     })
    //     .attr('y', function (d) {
    //         return yScale(d.y1) - heightDelta(d);
    //     });



    bars
        .transition().duration(DRAG_SAMPLE_INTERVAL)
        .attr('data-original-title', function(d) {
            return d.val;
        })
        .attr('width', function (d) {
            var width = xScale(d.y0) - xScale(d.y1) + heightDelta(d, xScale);
            if (width < 0) {
                console.log('d: ', d);
                console.log('scaled y0: ', xScale(d.y0));
                console.log('scaled y1: ', xScale(d.y1));
                console.log('heightDelta: ', heightDelta(d, xScale));
            }
            return xScale(d.y0) - xScale(d.y1) + heightDelta(d, xScale);
        })
        .attr('x', function (d) {
            return xScale(d.y1) - heightDelta(d, xScale);
        });

    var barHeight = (type === 'countBy') ? yScale.rangeBand() : Math.floor(height/globalStats.numBins) - 2;
    bars.enter().append('rect')

        .attr('data-container', '#histogram')
        .attr('data-placement', function (d) {
            if (d.type === 'global') {
                return 'bottom';
            } else {
                return 'top';
            }
        })
        .attr('data-toggle', 'tooltip')
        .attr('data-original-title', function(d) {
            return d.val;
        })

        .style('fill', function (d) {
            return color(d.type);
        })
        .attr('height', barHeight)
        .attr('width', function (d) {
            var width = xScale(d.y0) - xScale(d.y1) + heightDelta(d, xScale);
            if (width < 0) {
                console.log('scaled y0: ', xScale(d.y0));
                console.log('scaled y1: ', xScale(d.y1));
                console.log('heightDelta: ', heightDelta(d, xScale));
            }
            return xScale(d.y0) - xScale(d.y1) + heightDelta(d, xScale);
        })
        .attr('x', function (d) {
            return xScale(d.y1) - heightDelta(d, xScale);
        });


}

function heightDelta(d, xScale) {
    var minimumHeight = 5;
    var height = xScale(d.y0) - xScale(d.y1);
    if (d.val > 0 && d.y0 === 0 && height < minimumHeight) {
       return minimumHeight - height;
    } else {
        return 0;
    }
}

function prettyPrint (d) {
    if (!isNaN(d)) {
        // Large Number
        var precision = 4;
        if (d > 1000000 || (d !== 0 && d < 0.00001)) {
            return String(d.toExponential(precision));
        } else {
            d = Math.round(d*1000000) / 1000000; // Kill rounding errors
            return String(d);
        }

    } else {
        var str = String(d);
        var limit = 10;
        if (str.length > limit) {
            return str.substr(0, limit-1) + '...';
        } else {
            return str;
        }
    }
}

function initializeHistogramViz($el, model) {
    var width = $el.width();
    var height = $el.height(); // TODO: Get this more naturally.
    var data = model.attributes.data;
    var attribute = model.attributes.attribute;
    var globalStats = model.attributes.globalStats[attribute];
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

    //////////////////////////////////////////////////////////////////////////
    // Setup Scales and Axes
    //////////////////////////////////////////////////////////////////////////

    // We want ticks between bars if histogram, and under bars if countBy
    var yScale;
    if (type === 'countBy') {
        yScale = d3.scale.ordinal()
            .rangeRoundBands([0, height], 0.1, 0.1);
    } else {
        yScale = d3.scale.linear()
            .range([0, height]);
    }

    var xScale = d3.scale.linear()
        .range([width, 0]);

    if (type === 'countBy') {
        yScale.domain(_.range(globalStats.numBins));
    } else {
        yScale.domain([0, globalStats.numBins]);
    }

    var xDomainMax = _.max(stackedBins, function (bin) {
        return bin.total;
    }).total;

    if (DIST) {
        xDomainMax = 1.0;
    }

    xScale.domain([0, xDomainMax]);

    var numTicks = (type === 'countBy') ? globalStats.numBins : globalStats.numBins + 1;
    var yAxis = d3.svg.axis()
        .scale(yScale)
        .orient('right')
        .ticks(numTicks)
        .tickFormat(function (d) {
            if (type === 'countBy') {
                return prettyPrint(d); // name of bin
            } else {
                return prettyPrint(d * globalStats.binWidth + globalStats.minValue);
            }
        });

    var xAxis = d3.svg.axis()
        .scale(xScale)
        .ticks(5) // TODO: Dynamic?
        .orient('bottom') // TODO: format?
        .tickFormat(prettyPrint);

    //////////////////////////////////////////////////////////////////////////
    // Setup SVG
    //////////////////////////////////////////////////////////////////////////

    var svg = d3.select($el[0]).append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
        .append('g')
            .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    // svg.append('g')
    //     .attr('class', 'x axis')
    //     .attr('transform', 'translate(0,' + height + ')')
    //     .call(xAxis);

    svg.append('g')
        .attr('class', 'y axis')
        .attr('transform', 'translate(' + (width + 4) + ',0)')
        .call(yAxis);

    model.set('xScale', xScale);
    model.set('yScale', yScale);
    model.set('svg', svg);
}

function updateHistogramData(socket, marquee, collection, data, globalStats, Model, firstTime) {
    var histograms = [];
    _.each(data, function (val, key) {
        var histogram = new Model();
        histogram.set({data: val, globalStats: globalStats, firstTime: firstTime});
        histogram.id = key;
        histogram.set('attribute', key);
        histograms.push(histogram);

    });

    if (firstTime) {
        collection.reset(histograms);
    } else {
        collection.set(histograms);
    }
}

module.exports = {
    init: init
};

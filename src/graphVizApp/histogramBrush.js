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
var SPARKLINE_HEIGHT = 50;
var NUM_SPARKLINES = 30;

//////////////////////////////////////////////////////////////////////////////
// Globals for updates
//////////////////////////////////////////////////////////////////////////////

var color = d3.scale.ordinal()
        .range(['#0FA5C5', '#B2B2B2', '#0FA5C5', '#00BBFF'])
        .domain(['local', 'global', 'globalSmaller', 'localBigger']);

var colorHighlighted = d3.scale.ordinal()
        .range(['#E35E13', '#6B6868', '#E35E13', '#FF3000'])
        .domain(['local', 'global', 'globalSmaller', 'localBigger']);

var margin = {top: 10, right: 70, bottom: 20, left:20};
var marginSparklines = {top: 10, right: 20, bottom: 10, left: 20};
var lastSelection;
var attributes = [];
var activeAttributes = [];
var attributeChange = new Rx.Subject();
var globalStatsCache = {}; // For add histogram. TODO: Get rid of this and use replay
var d3DataMap = {};

function updateAttribute (oldAttribute, newAttribute, type) {
    // Delete old if it exists
    var indexOfOld = _.pluck(activeAttributes, 'name').indexOf(oldAttribute);
    if (indexOfOld > -1) {
        activeAttributes.splice(indexOfOld, 1);
    }

    // Add new one if it exists
    if (newAttribute) {
        activeAttributes.push({name: newAttribute, type: type});
    }

    // Only resend selections if an add/update
    if (newAttribute) {
        attributeChange.onNext(newAttribute);
    }
}

function init(socket, marquee) {
    debug('Initializing histogram brush');

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
        template: Handlebars.compile($('#histogramTemplateNoDropdown').html()),

        events: {
            'click .closeHistogramButton': 'close',
            'click .expandHistogramButton': 'expand',
            'click .expandedHistogramButton': 'shrink'
        },

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
        },

        shrink: function(evt) {
            $(evt.target).removeClass('expandedHistogramButton').addClass('expandHistogramButton');
            var vizContainer = this.model.get('vizContainer');
            var attribute = this.model.get('attribute');
            d3DataMap[attribute].svg.selectAll('*').remove();
            vizContainer.empty();
            var vizHeight = SPARKLINE_HEIGHT;
            vizContainer.height(String(vizHeight) + 'px');
            initializeSparklineViz(vizContainer, this.model); // TODO: Link to data?
            updateSparkline(vizContainer, this.model, attribute);
            this.model.set('sparkLines', true);
            updateAttribute(attribute, attribute, 'sparkLines');
        },

        expand: function(evt) {
            $(evt.target).removeClass('expandHistogramButton').addClass('expandedHistogramButton');
            var vizContainer = this.model.get('vizContainer');
            var attribute = this.model.get('attribute');
            d3DataMap[attribute].svg.selectAll('*').remove();
            vizContainer.empty();
            var vizHeight = this.model.get('globalStats').histograms[attribute].numBins * BAR_THICKNESS + margin.top + margin.bottom;
            vizContainer.height(String(vizHeight) + 'px');
            initializeHistogramViz(vizContainer, this.model); // TODO: Link to data?
            updateHistogram(vizContainer, this.model, attribute);
            this.model.set('sparkLines', false);
            updateAttribute(attribute, attribute, 'histogram');
        },

        close: function() {
            this.$el.remove();
            histograms.remove(this.model);
        }
    });


    var AllHistogramsView = Backbone.View.extend({
        el: $histogram,
        histogramsContainer: $('#histograms'),
        initialize: function () {
            this.listenTo(histograms, 'add', this.addHistogram);
            this.listenTo(histograms, 'remove', this.removeHistogram);
            this.listenTo(histograms, 'reset', this.addAll);
            this.listenTo(histograms, 'all', this.render);
            this.listenTo(histograms, 'change', this.update);
        },
        render: function () {
            // TODO: Use something other than visibility
            this.$el.css('visibility', 'visible');
        },
        addHistogram: function (histogram) {
            var view = new HistogramView({model: histogram});
            var childEl = view.render().el;
            var attribute = histogram.get('attribute');
            $(this.histogramsContainer).append(childEl);
            histogram.set('$el', $(childEl));
            var vizContainer = $(childEl).children('.vizContainer');
            histogram.set('vizContainer', vizContainer);
            var vizHeight = SPARKLINE_HEIGHT;

            if (histogram.get('sparkLines')) {
                vizContainer.height(String(vizHeight) + 'px');
                initializeSparklineViz(vizContainer, histogram); // TODO: Link to data?
                updateSparkline(vizContainer, histogram, attribute);
            } else {
                vizHeight = histogram.get('globalStats').histograms[attribute].numBins * BAR_THICKNESS + margin.top + margin.bottom;
                vizContainer.height(String(vizHeight) + 'px');
                initializeHistogramViz(vizContainer, histogram); // TODO: Link to data?
                updateHistogram(vizContainer, histogram, attribute);
            }

        },
        removeHistogram: function (histogram) {
            updateAttribute(histogram.attributes.attribute);
        },
        update: function (histogram) {
            // TODO: Find way to not fire this on first time
            if (!histogram.get('firstTime')) {
                histograms.each(function (histogram) {

                    if (histogram.get('sparkLines')) {
                        updateSparkline(histogram.get('vizContainer'), histogram, histogram.get('attribute'));
                    } else {
                        updateHistogram(histogram.get('vizContainer'), histogram, histogram.get('attribute'));
                    }
                });
            }
        },
        addAll: function () {
            $(this.histogramsContainer).empty();
            histograms.each(this.addHistogram, this);
        }
    });
    var allHistogramsView = new AllHistogramsView();


    //////////////////////////////////////////////////////////////////////////
    // Setup Streams
    //////////////////////////////////////////////////////////////////////////

    // Grab global stats at initialization
    var globalStats = new Rx.ReplaySubject(1);
    var params = {all: true, mode: MODE};
    var paramsSparklines = {all: true, mode: MODE, binning: {'_goalNumberOfBins': NUM_SPARKLINES}};
    var globalStream = Rx.Observable.fromCallback(socket.emit, socket)('aggregate', params);
    var globalStreamSparklines = Rx.Observable.fromCallback(socket.emit, socket)('aggregate', paramsSparklines);

    Rx.Observable.zip(globalStream, globalStreamSparklines, function (histogramsReply, sparkLinesReply) {
        checkReply(histogramsReply);
        checkReply(sparkLinesReply);
        return {histograms: histogramsReply.data, sparkLines: sparkLinesReply.data};
    }).do(function (data) {
        globalStatsCache = data;
        attributes = _.filter(_.keys(data.histograms), function (val) {
            var isTitle = (val !== '_title');
            return isTitle;
        });
        var template = Handlebars.compile($('#addHistogramTemplate').html());
        var params = {
            fields: attributes
        };
        var html = template(params);
        $('#addHistogram').html(html);

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
        var binning = {};
        var attributes = _.pluck(activeAttributes, 'name');
        _.each(activeAttributes, function (attr) {
            if (attr.type === 'sparkLines') {
                binning[attr.name] = data.globalStats.sparkLines[attr.name];
            } else {
                binning[attr.name] = data.globalStats.histograms[attr.name];
            }
        });

        var params = {sel: data.sel, attributes: attributes, binning: binning, mode: MODE};
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

        // TODO: Pull this out from here.
        allHistogramsView.render();

        // TODO: Figure out if we need to treat these separately or not
        if (data.type === 'selection' || data.type === 'attributeChange') {
            updateHistogramData(socket, marquee, histograms, data.reply.data, data.globalStats, HistogramModel);
        } else if (data.type === 'drag') {
            updateHistogramData(socket, marquee, histograms, data.reply.data, data.globalStats, HistogramModel);
        }

    }).subscribe(_.identity, util.makeErrorHandler('Brush selection aggregate error'));

    //////////////////////////////////////////////////////////////////////////
    // General Setup
    //////////////////////////////////////////////////////////////////////////

    // We use this more verbose approach to click handlers because it watches
    // the DOM for added elements.

    $('#histogram').on('click', '.histogramDropdownField', function() {
        // TODO: Get this value in a cleaner way
        var oldField = $(this).parent().parent().siblings('button').text().trim();
        var field = $(this).text().trim();
        $(this).parents('.dropdown').find('.btn').text(field);
        $(this).parents('.dropdown').find('.btn').val(field);
        updateAttribute(oldField, field, 'sparkLines');
    });

    $('#histogram').on('click', '.addHistogramDropdownField', function () {
        var attribute = $(this).text().trim();
        updateAttribute(null, attribute, 'sparkLines');

        var histogram = new HistogramModel();
        histogram.set({data: {}, globalStats: globalStatsCache, firstTime: true, sparkLines: true});
        histogram.id = attribute;
        histogram.set('attribute', attribute);
        histograms.add([histogram]);
    });
}

function checkReply (reply) {
    if (!reply) {
        console.error('Unexpected server error on global aggregate');
    } else if (reply && !reply.success) {
        console.log('Server replied with error from global aggregate:', reply.error, reply.stack);
    }
}

function toStackedObject(local, total, idx, key, numLocal, numTotal, distribution) {
    // If we want to normalize to a distribution as percentage of total.
    var stackedObj;
    if (distribution) {
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

function toStackedBins(bins, globalBins, type, numLocal, numTotal, distribution) {
    // Transform bins and global bins into stacked format.
    // Assumes that globalBins is always a superset of bins
    // TODO: Get this in a cleaner, more extensible way
    var stackedBins = [];
    if (type === 'countBy') {
        var globalKeys = _.keys(globalBins);
        _.each(globalKeys, function (key, idx) {
            var local = bins[key] || 0;
            var total = globalBins[key];
            var stackedObj = toStackedObject(local, total, idx, key, numLocal, numTotal, distribution);
            stackedBins.push(stackedObj);
        });

    } else {
        // If empty bin array, make it all 0s.
        if (bins.length === 0) {
            bins = Array.apply(null, new Array(globalBins.length)).map(function () { return 0; });
        }
        var zippedBins = _.zip(bins, globalBins); // [[0,2], [1,4], ... ]
        _.each(zippedBins, function (stack, idx) {
            var local = stack[0] || 0;
            var total = stack[1];
            var stackedObj = toStackedObject(local, total, idx, '', numLocal, numTotal, distribution);
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
    var width = $el.width() - margin.left - margin.right;
    var data = model.attributes.data;
    var globalStats = model.attributes.globalStats.histograms[attribute];
    var bins = data.bins || []; // Guard against empty bins.
    var globalBins = globalStats.bins || [];
    var type = (data.type !== 'nodata') ? data.type : globalStats.type;
    data.numValues = data.numValues || 0;

    var svg = d3DataMap[attribute].svg;
    var xScale = d3DataMap[attribute].xScale;
    var yScale = d3DataMap[attribute].yScale;

    var barPadding = 2;
    var stackedBins = toStackedBins(bins, globalBins, type, data.numValues, globalStats.numValues, DIST);
    var barHeight = (type === 'countBy') ? yScale.rangeBand() : Math.floor(height/globalStats.numBins) - barPadding;


    //////////////////////////////////////////////////////////////////////////
    // Create Columns
    //////////////////////////////////////////////////////////////////////////

    var columns = selectColumns(svg, stackedBins);
    applyAttrColumns(columns.enter().append('g'))
        .attr('transform', function (d, i) {
            return 'translate(0,' + yScale(i) + ')';
        }).append('rect')
            .attr('height', barHeight + barPadding)
            .attr('width', width)
            .attr('opacity', 0)
            .on('mouseover', toggleTooltips.bind(null, true))
            .on('mouseout', toggleTooltips.bind(null, false));


    //////////////////////////////////////////////////////////////////////////
    // Create and Update Bars
    //////////////////////////////////////////////////////////////////////////

    var bars = selectBars(columns);

    bars.transition().duration(DRAG_SAMPLE_INTERVAL)
        .attr('data-original-title', function(d) {
            return d.val;
        })
        .attr('width', function (d) {
            return xScale(d.y0) - xScale(d.y1) + heightDelta(d, xScale);
        })
        .attr('x', function (d) {
            return xScale(d.y1) - heightDelta(d, xScale);
        });


    applyAttrBars(bars.enter().append('rect'), 'bottom', 'top')
        .attr('height', barHeight)
        .attr('width', function (d) {
            return xScale(d.y0) - xScale(d.y1) + heightDelta(d, xScale);
        })
        .attr('x', function (d) {
            return xScale(d.y1) - heightDelta(d, xScale);
        });


}

function updateSparkline($el, model, attribute) {
    var width = $el.width() - marginSparklines.left - marginSparklines.right;
    var height = $el.height() - marginSparklines.top - marginSparklines.bottom;
    var data = model.attributes.data;
    var globalStats = model.attributes.globalStats.sparkLines[attribute];
    var bins = data.bins || []; // Guard against empty bins.
    var globalBins = globalStats.bins || [];
    var type = (data.type !== 'nodata') ? data.type : globalStats.type;
    data.numValues = data.numValues || 0;

    var svg = d3DataMap[attribute].svg;
    var xScale = d3DataMap[attribute].xScale;
    var yScale = d3DataMap[attribute].yScale;

    var barPadding = 1;
    var stackedBins = toStackedBins(bins, globalBins, type, data.numValues, globalStats.numValues, DIST);
    var barWidth = (type === 'countBy') ? xScale.rangeBand() : Math.floor(width/globalStats.numBins) - barPadding;

    //////////////////////////////////////////////////////////////////////////
    // Create Columns
    //////////////////////////////////////////////////////////////////////////

    var columns = selectColumns(svg, stackedBins);
    applyAttrColumns(columns.enter().append('g'))
        .attr('transform', function (d, i) {
            return 'translate(' + xScale(i) + ',0)';
        })
        .append('rect')
            .attr('width', barWidth + barPadding)
            .attr('height', height)
            .attr('opacity', 0)
            .on('mouseover', toggleTooltips.bind(null, true))
            .on('mouseout', toggleTooltips.bind(null, false));

    //////////////////////////////////////////////////////////////////////////
    // Create and Update Bars
    //////////////////////////////////////////////////////////////////////////

    var bars = selectBars(columns);

    bars.transition().duration(DRAG_SAMPLE_INTERVAL)
        .attr('data-original-title', function(d) {
            return d.val;
        })
        .attr('height', function (d) {
            return yScale(d.y0) - yScale(d.y1) + heightDelta(d, yScale);
        })
        .attr('y', function (d) {
            return yScale(d.y1) - heightDelta(d, yScale);
        });


    applyAttrBars(bars.enter().append('rect'), 'left', 'right')
        .attr('width', barWidth)
        .attr('height', function (d) {
            return yScale(d.y0) - yScale(d.y1) + heightDelta(d, yScale);
        })
        .attr('y', function (d) {
            return yScale(d.y1) - heightDelta(d, yScale);
        });

}

function selectColumns (svg, stackedBins) {
    return svg.selectAll('.column')
        .data(stackedBins, function (d) {
            return d.id;
        });
}

function selectBars (columns) {
    return columns.selectAll('rect')
        .data(function (d) {
            return d;
        }, function (d) {
            return d.barNum + d.binId;
        });
}

function applyAttrColumns (columns) {
    return columns.classed('g', true)
        .classed('column', true);
}

function applyAttrBars (bars, globalPos, localPos) {
    return bars
        .attr('data-container', '#histogram')
        .attr('data-placement', function (d) {
            if (d.type === 'global') {
                return globalPos;
            } else {
                return localPos;
            }
        })

        .attr('data-html', true)
        .attr('data-template', function (d) {
            var fill = colorHighlighted(d.type);
            return '<div class="tooltip" role="tooltip"><div class="tooltip-arrow"></div>' +
                '<div class="tooltip-inner" style="background-color: ' + fill + '"></div></div>';
        })

        .attr('data-toggle', 'tooltip')
        .attr('data-original-title', function(d) {
            return d.val;
        })

        .style('pointer-events', 'none')
        .style('fill', function (d) {
            return color(d.type);
        });
}

function toggleTooltips (showTooltip) {
    var col = d3.select(d3.event.target.parentNode);
    var children = col[0][0].children;
    _.each(children, function (child) {
        if (showTooltip) {
            $(child).tooltip('fixTitle');
            $(child).tooltip('show');
        } else {
            $(child).tooltip('hide');
        }
    });
    highlight(col.selectAll('rect'), showTooltip);
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
        if (Math.abs(d) > 1000000 || (d !== 0 && Math.abs(d) < 0.00001)) {
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
    var globalStats = model.attributes.globalStats.histograms[attribute];
    var bins = data.bins || []; // Guard against empty bins.
    var globalBins = globalStats.bins || [];
    var type = (data.type && data.type !== 'nodata') ? data.type : globalStats.type;
    data.numValues = data.numValues || 0;

    // Transform bins and global bins into stacked format.
    var stackedBins = toStackedBins(bins, globalBins, type, data.numValues, globalStats.numValues, DIST);

    width = width - margin.left - margin.right;
    height = height - margin.top - margin.bottom;

    var yScale = setupBinScale(type, height, globalStats.numBins);
    var xScale = setupAmountScale(width, stackedBins, DIST);

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

    var svg = setupSvg($el[0], margin, width, height);

    svg.append('g')
        .attr('class', 'y axis')
        .attr('transform', 'translate(' + (width + 4) + ',0)')
        .call(yAxis);

    d3DataMap[attribute] = {
        xScale: xScale,
        yScale: yScale,
        svg: svg
    };
}

function initializeSparklineViz($el, model) {
    var width = $el.width();
    var height = $el.height();
    var data = model.attributes.data;
    var attribute = model.attributes.attribute;
    var globalStats = model.attributes.globalStats.sparkLines[attribute];
    var bins = data.bins || []; // Guard against empty bins.
    var globalBins = globalStats.bins || [];
    var type = (data.type && data.type !== 'nodata') ? data.type : globalStats.type;
    data.numValues = data.numValues || 0;

    // Transform bins and global bins into stacked format.
    var stackedBins = toStackedBins(bins, globalBins, type, data.numValues, globalStats.numValues, DIST);

    width = width - marginSparklines.left - marginSparklines.right;
    height = height - marginSparklines.top - marginSparklines.bottom;

    var xScale = setupBinScale(type, width, globalStats.numBins);
    var yScale = setupAmountScale(height, stackedBins, DIST);
    var svg = setupSvg($el[0], marginSparklines, width, height);

    d3DataMap[attribute] = {
        xScale: xScale,
        yScale: yScale,
        svg: svg
    };
}

function setupBinScale (type, size, globalNumBins) {
    // We want ticks between bars if histogram, and under bars if countBy
    if (type === 'countBy') {
        return d3.scale.ordinal()
            .rangeRoundBands([0, size], 0.1, 0.1)
            .domain(_.range(globalNumBins));
    } else {
        return d3.scale.linear()
            .range([0, size])
            .domain([0, globalNumBins]);
    }
}

function setupAmountScale (size, stackedBins, distribution) {
    var domainMax = 1.0;
    if (!distribution) {
        domainMax = _.max(stackedBins, function (bin) {
            return bin.total;
        }).total;
    }

    return d3.scale.linear()
            .range([size, 0])
            .domain([0, domainMax]);
}

function setupSvg (el, margin, width, height) {
    return d3.select(el).append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
        .append('g')
            .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
}


function updateHistogramData (socket, marquee, collection, data, globalStats, Model) {
    var histograms = [];
    _.each(data, function (val, key) {
        var histogram = new Model();
        histogram.set({data: val, globalStats: globalStats, firstTime: false});
        histogram.id = key;
        histogram.set('attribute', key);
        histograms.push(histogram);

    });
    collection.set(histograms);
}

module.exports = {
    init: init
};

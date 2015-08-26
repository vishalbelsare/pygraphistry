'use strict';

// var debug   = require('debug')('graphistry:StreamGL:graphVizApp:histogramPanel');
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
// var MODE = 'default';
var DIST = false;
var DRAG_SAMPLE_INTERVAL = 200;
var BAR_THICKNESS = 16;
var SPARKLINE_HEIGHT = 60;
var NUM_SPARKLINES = 30;
var NUM_COUNTBY_SPARKLINES = NUM_SPARKLINES - 1;
var NUM_COUNTBY_HISTOGRAM = NUM_COUNTBY_SPARKLINES;

//////////////////////////////////////////////////////////////////////////////
// Globals for updates
//////////////////////////////////////////////////////////////////////////////

// TODO: Pull these into the created histogram object, away from globals.
var color = d3.scale.ordinal()
        .range(['#0FA5C5', '#929292', '#0FA5C5', '#00BBFF'])
        .domain(['local', 'global', 'globalSmaller', 'localBigger']);

var colorUnselected = d3.scale.ordinal()
        .range(['#96D8E6', '#C8C8C8', '#0FA5C5', '#00BBFF'])
        .domain(['local', 'global', 'globalSmaller', 'localBigger']);

var colorHighlighted = d3.scale.ordinal()
        .range(['#E35E13', '#6B6868', '#E35E13', '#FF3000'])
        .domain(['local', 'global', 'globalSmaller', 'localBigger']);

var margin = {top: 10, right: 70, bottom: 20, left:20};
var marginSparklines = {top: 15, right: 10, bottom: 15, left: 10};
var attributeChange;
var updateAttributeSubject;
var globalStatsCache = {}; // For add histogram. TODO: Get rid of this and use replay
// TODO: Extract this into the model.
var d3DataMap = {};
// TODO: Extract this out into the model.
var histogramFilters = {};
var histogramFilterSubject;


//////////////////////////////////////////////////////////////////////////////
// Models
//////////////////////////////////////////////////////////////////////////////

function initHistograms (globalStats, attributes, filterSubject, attrChangeSubject, updateAttributeSubj) {
    histogramFilterSubject = filterSubject;
    globalStatsCache = globalStats;
    attributeChange = attrChangeSubject;
    updateAttributeSubject = updateAttributeSubj;

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
            'click .expandedHistogramButton': 'shrink',
            'click .refreshHistogramButton': 'refresh'
        },

        initialize: function () {
            this.listenTo(this.model, 'destroy', this.remove);
        },
        render: function () {
            var params = {
                fields: attributes,
                attribute: this.model.attributes.attribute,
                modelId: this.model.cid,
                id: this.cid
            };

            var html = this.template(params);
            this.$el.html(html);
            return this;
        },

        shrink: function (evt) {
            $(evt.target).removeClass('expandedHistogramButton').addClass('expandHistogramButton');
            $(evt.target).removeClass('fa-caret-right').addClass('fa-caret-down');
            var vizContainer = this.model.get('vizContainer');
            var attribute = this.model.get('attribute');
            var vizHeight = SPARKLINE_HEIGHT;
            toggleExpandedD3(attribute, vizContainer, vizHeight, this);
        },

        expand: function (evt) {
            $(evt.target).removeClass('expandHistogramButton').addClass('expandedHistogramButton');
            $(evt.target).removeClass('fa-caret-down').addClass('fa-caret-right');
            var vizContainer = this.model.get('vizContainer');
            var attribute = this.model.get('attribute');
            var histogram = this.model.get('globalStats').histograms[attribute];
            var numBins = (histogram.type === 'countBy') ? Math.min(NUM_COUNTBY_HISTOGRAM, histogram.numBins) : histogram.numBins;
            var vizHeight = numBins * BAR_THICKNESS + margin.top + margin.bottom;
            toggleExpandedD3(attribute, vizContainer, vizHeight, this);
        },

        refresh: function () {
            var attribute = this.model.get('attribute');
            var id = this.cid;
            $('.refreshHistogramButton-'+id).css('display', 'none');
            var redraw = histogramFilters[attribute].redraw;
            delete histogramFilters[attribute];
            histogramFilterSubject.onNext(histogramFilters);
            // TODO: Figure out how to do this directly through backbone
            redraw();
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
            this.listenTo(histograms, 'change:timeStamp', this.update);
        },
        render: function () {

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

    // Setup add histogram button.
    var template = Handlebars.compile($('#addHistogramTemplate').html());
    var params = {
        fields: attributes
    };
    var html = template(params);
    $('#addHistogram').html(html);

    // We use this more verbose approach to click handlers because it watches
    // the DOM for added elements.
    // TODO: Wrap this into the panel view?
    $histogram.on('click', '.addHistogramDropdownField', function () {
        var attribute = $(this).text().trim();
        updateAttribute(null, attribute, 'sparkLines');

        // TODO: Represent this generically.
        var histogram = new HistogramModel();
        histogram.set({data: {}, globalStats: globalStatsCache, firstTime: true, sparkLines: true});
        histogram.id = attribute;
        histogram.set('attribute', attribute);
        histograms.add([histogram]);
    });

    return {
        view: allHistogramsView,
        collection: histograms,
        model: HistogramModel
    };
}






//////////////////////////////////////////////////////////////////////////////
// Histogram Widget
//////////////////////////////////////////////////////////////////////////////

function toStackedObject(local, total, idx, key, attr, numLocal, numTotal, distribution) {
    // If we want to normalize to a distribution as percentage of total.
    var stackedObj;
    if (distribution) {
        local = (numLocal === 0) ? 0 : local / numLocal;
        total = (numTotal === 0) ? 0 : total / numTotal;

        if (local <= total) {
            stackedObj = [
                {y0: 0, y1: local, val: local, type: 'local', binId: idx, barNum: 0, attr: attr},
                {y0: local, y1: total, val: total, type: 'global', binId: idx, barNum: 1, attr: attr}
            ];
        } else {
            stackedObj = [
                {y0: 0, y1: total, val: total, type: 'globalSmaller', binId: idx, barNum: 1, attr: attr},
                {y0: total, y1: local, val: local, type: 'localBigger', binId: idx, barNum: 0, attr: attr}
            ];
        }

    } else {
        stackedObj = [
            // We do a max because sometimes we get incorrect global values that are slightly too small
            {y0: 0, y1: local, val: local, type: 'local', binId: idx, barNum: 0, attr: attr},
            {y0: local, y1: Math.max(total, local), val: total, type: 'global', binId: idx, barNum: 1, attr: attr}
        ];
    }

    stackedObj.total = total;
    stackedObj.local = local;
    stackedObj.name = key;
    stackedObj.id = idx;
    stackedObj.attr = attr;
    return stackedObj;
}

function toStackedBins(bins, globalStats, type, attr, numLocal, numTotal, distribution, limit) {
    // Transform bins and global bins into stacked format.
    // Assumes that globalBins is always a superset of bins
    // TODO: Get this in a cleaner, more extensible way
    var globalBins = globalStats.bins || [];
    var stackedBins = [];
    if (type === 'countBy') {
        var globalKeys = _.keys(globalBins);
        _.each(_.range(Math.min(globalKeys.length, limit)), function (idx) {
            var key = globalKeys[idx];
            var local = bins[key] || 0;
            var total = globalBins[key];
            var stackedObj = toStackedObject(local, total, idx, key, attr, numLocal, numTotal, distribution);
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
            var total = stack[1] || 0;
            var start = globalStats.minValue + (globalStats.binWidth * idx);
            var stop = start + globalStats.binWidth;
            var name = prettyPrint(start, attr) + '  :  ' + prettyPrint(stop, attr);
            var stackedObj = toStackedObject(local, total, idx, name, attr, numLocal, numTotal, distribution);
            stackedBins.push(stackedObj);
        });
    }
    return stackedBins;
}


function highlight(selection, toggle) {
    _.each(selection[0], function (sel) {
        var data = sel.__data__;
        var unhighlightedColor;
        if (histogramFilters[data.attr] !== undefined) {
            var min = histogramFilters[data.attr].firstBin;
            var max = histogramFilters[data.attr].lastBin;
            if (data.binId >= min && data.binId <= max) {
                unhighlightedColor = color;
            } else {
                unhighlightedColor = colorUnselected;
            }
        } else {
            unhighlightedColor = color;
        }

        var colorScale = (toggle) ? colorHighlighted : unhighlightedColor;
        $(sel).css('fill', colorScale(data.type));
    });
}

function updateHistogram($el, model, attribute) {
    var height = $el.height() - margin.top - margin.bottom;
    var width = $el.width() - margin.left - margin.right;
    var data = model.attributes.data;
    var globalStats = model.attributes.globalStats.histograms[attribute];
    var bins = data.bins || []; // Guard against empty bins.
    var type = (data.type && data.type !== 'nodata') ? data.type : globalStats.type;
    var numBins = (type === 'countBy' ? Math.min(NUM_COUNTBY_HISTOGRAM, globalStats.numBins) : globalStats.numBins);
    data.numValues = data.numValues || 0;

    var svg = d3DataMap[attribute].svg;
    var xScale = d3DataMap[attribute].xScale;
    var yScale = d3DataMap[attribute].yScale;

    var barPadding = 2;
    var stackedBins = toStackedBins(bins, globalStats, type, attribute, data.numValues, globalStats.numValues,
            DIST, (type === 'countBy' ? NUM_COUNTBY_HISTOGRAM : 0));
    var barHeight = (type === 'countBy') ? yScale.rangeBand() : Math.floor(height/numBins) - barPadding;

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
            .on('mouseover', toggleTooltips.bind(null, true, svg))
            .on('mouseout', toggleTooltips.bind(null, false, svg));


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
        .attr('class', 'bar-rect')
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
    var id = model.cid;
    var globalStats = model.attributes.globalStats.sparkLines[attribute];
    var bins = data.bins || []; // Guard against empty bins.
    var type = (data.type && data.type !== 'nodata') ? data.type : globalStats.type;
    var numBins = (type === 'countBy' ? Math.min(NUM_COUNTBY_SPARKLINES, globalStats.numBins) : globalStats.numBins);
    data.numValues = data.numValues || 0;

    var svg = d3DataMap[attribute].svg;
    var xScale = d3DataMap[attribute].xScale;
    var yScale = d3DataMap[attribute].yScale;

    var barPadding = 1;
    var stackedBins = toStackedBins(bins, globalStats, type, attribute, data.numValues, globalStats.numValues,
            DIST, (type === 'countBy' ? NUM_COUNTBY_SPARKLINES : 0));

    // var barWidth = (type === 'countBy') ? xScale.rangeBand() : Math.floor(width/numBins) - barPadding;
    var barWidth = (type === 'countBy') ? xScale.rangeBand() : (width/numBins) - barPadding;


    // TODO: Figure out a cleaner way to pass data between the two events.
    var mouseClickData = {};
    var filterCallback = updateSparkline.bind(null, $el, model, attribute);

    //////////////////////////////////////////////////////////////////////////
    // Create Tooltip Text Elements
    //////////////////////////////////////////////////////////////////////////

    // TODO: Is there a better/cleaner way to create fixed elements in D3?
    svg.selectAll('.lowerTooltip')
        .data([''])
        .enter().append('text')
        .attr('class', 'lowerTooltip')
        .attr('y', height + marginSparklines.bottom - 4)
        .attr('x', 0)
        .attr('opacity', 0)
        .attr('fill', color('global'))
        .attr('font-size', '0.7em');

    var upperTooltip = svg.selectAll('.upperTooltip')
        .data([''])
        .enter().append('text')
        .attr('class', 'upperTooltip')
        .attr('y', -4)
        .attr('x', 0)
        .attr('opacity', 0)
        .attr('font-size', '0.7em');

    upperTooltip.selectAll('.globalTooltip').data([''])
        .enter().append('tspan')
        .attr('class', 'globalTooltip')
        .attr('fill', color('global'))
        .text('global, ');

    upperTooltip.selectAll('.localTooltip').data([''])
        .enter().append('tspan')
        .attr('class', 'localTooltip')
        .attr('fill', color('local'))
        .text('local');

    //////////////////////////////////////////////////////////////////////////
    // Create Columns
    //////////////////////////////////////////////////////////////////////////

    var updateOpacity = function (d, i) {
        var filters = histogramFilters[attribute];
        if (filters && i >= filters.firstBin && i <= filters.lastBin) {
            return 0.25;
        } else {
            return 0;
        }
    };

    var columns = selectColumns(svg, stackedBins);
    var columnRects = svg.selectAll('.column-rect');
    columnRects.attr('opacity', updateOpacity);

    applyAttrColumns(columns.enter().append('g'))
        .attr('attribute', attribute)
        .attr('binnumber', function (d, i) {
            return i;
        })
        .attr('transform', function (d, i) {
            return 'translate(' + xScale(i) + ',0)';
        })
        .append('rect')
            .attr('class', 'column-rect')
            .attr('width', barWidth + barPadding)
            .attr('height', height)
            .attr('fill', '#556ED4')
            .attr('opacity', updateOpacity)
            .on('mousedown', handleHistogramDown.bind(null, mouseClickData, filterCallback, id))
            .on('mouseover', toggleTooltips.bind(null, true, svg))
            .on('mouseout', toggleTooltips.bind(null, false, svg));

    //////////////////////////////////////////////////////////////////////////
    // Create and Update Bars
    //////////////////////////////////////////////////////////////////////////

    var bars = selectBars(columns)
        .style('fill', reColor);

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
        .attr('class', 'bar-rect')
        .attr('width', barWidth)
        .attr('height', function (d) {
            return yScale(d.y0) - yScale(d.y1) + heightDelta(d, yScale);
        })
        .attr('y', function (d) {
            return yScale(d.y1) - heightDelta(d, yScale);
        });

}

function handleHistogramDown (data, cb, id) {
    var col = d3.select(d3.event.target.parentNode);
    var $element = $(col[0][0]);
    var $parent = $element.parent();

    var startBin = $element.attr('binnumber');
    var attr = $element.attr('attribute');
    updateHistogramFilters(attr, id, startBin, startBin, cb);

    var positionChanges = Rx.Observable.fromEvent($parent, 'mouseover')
        .map(function (evt) {
            var $col = $(evt.target).parent();
            var binNum = $col.attr('binnumber');

            var ends = [+startBin, +binNum];
            var firstBin = _.min(ends);
            var lastBin = _.max(ends);
            updateHistogramFilters(attr, id, firstBin, lastBin, cb);
            cb();
        }).subscribe(_.identity, util.makeErrorHandler('Histogram Filter Dragging'));

    Rx.Observable.fromEvent($(document.body), 'mouseup')
        .take(1)
        .do(function () {
            positionChanges.dispose();
            histogramFilterSubject.onNext(histogramFilters);
            cb();
        })
        .subscribe(_.identity, util.makeErrorHandler('Histogram Filter Mouseup'));
}

function selectColumns (svg, stackedBins) {
    return svg.selectAll('.column')
        .data(stackedBins, function (d) {
            return d.id;
        });
}

function selectBars (columns) {
    return columns.selectAll('.bar-rect')
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

function reColor (d) {
    if (histogramFilters[d.attr] !== undefined) {
        var min = histogramFilters[d.attr].firstBin;
        var max = histogramFilters[d.attr].lastBin;
        if (d.binId >= min && d.binId <= max) {
            return color(d.type);
        } else {
            return colorUnselected(d.type);
        }
    } else {
        return color(d.type);
    }
}

function applyAttrBars (bars, globalPos, localPos) {
    return bars
        .attr('data-container', 'body')
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
                '<div class="tooltip-inner" style="background-color: ' + fill + '; border-style: solid; border-width: 1px"></div></div>';
        })

        .attr('data-toggle', 'tooltip')
        .attr('data-original-title', function(d) {
            return d.val;
        })

        .style('pointer-events', 'none')
        .style('fill', reColor);
}

function toggleTooltips (showTooltip, svg) {
    var col = d3.select(d3.event.target.parentNode);
    var bars = col.selectAll('.bar-rect');

    var data = col[0][0].__data__;

    // _.each(bars[0], function (child) {
    //     if (showTooltip) {
    //         $(child).tooltip('fixTitle');
    //         $(child).tooltip('show');
    //     } else {
    //         $(child).tooltip('hide');
    //     }
    // });

    var local = bars[0][0].__data__.val;
    var global = bars[0][1].__data__.val;

    var tooltipBox = svg.select('.upperTooltip');
    var globalTooltip = tooltipBox.select('.globalTooltip');
    var localTooltip = tooltipBox.select('.localTooltip');
    if (showTooltip) {
        globalTooltip.text('TOTAL: ' + String(global) + ', ');
        localTooltip.text('SELECTED: ' + String(local));
        tooltipBox.attr('opacity', 1);
    } else {
        globalTooltip.text('');
        localTooltip.text('');
        tooltipBox.attr('opacity', 0);
    }


    var textBox = svg.select('.lowerTooltip');
    if (showTooltip) {
        textBox.text(data.name);
        textBox.attr('opacity', 1);
    } else {
        textBox.text('');
        textBox.attr('opacity', 0);
    }

    highlight(bars, showTooltip);
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

function maybePrecise(v) {
    var diff = Math.abs(v - Math.round(v));
    if (diff > 0.1) {
        return v.toFixed(1);
    } else {
        return v;
    }
}

function prettyPrint (d, attributeName, noLimit) {
    if (!isNaN(d)) {
        d = Number(d); // Cast to number in case it's a string

        if (attributeName.indexOf('Date') > -1) {
            return d3.time.format('%m/%d/%Y')(new Date(d));
        }

        var abs = Math.abs(d);
        if (abs > 1000000000000 || (d !== 0 && Math.abs(d) < 0.00001)) {
            return String(d.toExponential(4));
        } else if (abs > 1000000000) {
            return String( maybePrecise(d/1000000000) ) + 'B';
        } else if (abs > 1000000) {
            return String( maybePrecise(d/1000000) ) + 'M';
        } else if (abs > 1000) {
            return String( maybePrecise(d/1000) ) + 'K';
        } else {
            d = Math.round(d*1000000) / 1000000; // Kill rounding errors
            return String(d);
        }

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
        if (str.length > limit && !noLimit) {
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
    var id = model.cid;
    var attribute = model.attributes.attribute;
    var globalStats = model.attributes.globalStats.histograms[attribute];
    var name = model.get('attribute');
    var bins = data.bins || []; // Guard against empty bins.
    var type = (data.type && data.type !== 'nodata') ? data.type : globalStats.type;
    var numBins = (type === 'countBy' ? Math.min(NUM_COUNTBY_HISTOGRAM, globalStats.numBins) : globalStats.numBins);
    data.numValues = data.numValues || 0;

    // Transform bins and global bins into stacked format.
    var stackedBins = toStackedBins(bins, globalStats, type, attribute, data.numValues, globalStats.numValues,
        DIST, (type === 'countBy' ? NUM_COUNTBY_HISTOGRAM : 0));

    width = width - margin.left - margin.right;
    height = height - margin.top - margin.bottom;

    var yScale = setupBinScale(type, height, numBins);
    var xScale = setupAmountScale(width, stackedBins, DIST);

    var numTicks = (type === 'countBy' ? numBins : numBins + 1);
    var fullTitles = [];
    var yAxis = d3.svg.axis()
        .scale(yScale)
        .orient('right')
        .ticks(numTicks)
        .tickFormat(function (d) {
            if (type === 'countBy') {
                fullTitles[d] = prettyPrint(stackedBins[d].name, name, true);
                return prettyPrint(stackedBins[d].name, name); // name of bin
            } else {
                fullTitles[d] = prettyPrint(d * globalStats.binWidth + globalStats.minValue, name, true);
                return prettyPrint(d * globalStats.binWidth + globalStats.minValue, name);
            }
        });

    var svg = setupSvg($el[0], margin, width, height);

    svg.append('g')
        .attr('class', 'y axis')
        .attr('id', 'yaxis-' + id)
        .attr('transform', 'translate(' + (width + 4) + ',0)')
        .call(yAxis);

    d3.select('#yaxis-' + id)
        .selectAll('text')
        .attr('data-container', 'body')
        .attr('data-placement', 'left')
        .attr('data-toggle', 'tooltip')
        .attr('data-original-title', function(d) {
            return fullTitles[d];
        });

    d3.select('#yaxis-' + id)
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
    var type = (data.type && data.type !== 'nodata') ? data.type : globalStats.type;
    var numBins = (type === 'countBy' ? Math.min(NUM_COUNTBY_SPARKLINES, globalStats.numBins) : globalStats.numBins);
    data.numValues = data.numValues || 0;

    // Transform bins and global bins into stacked format.
    var stackedBins = toStackedBins(bins, globalStats, type, attribute, data.numValues, globalStats.numValues,
        DIST, (type === 'countBy' ? NUM_COUNTBY_SPARKLINES : 0));

    width = width - marginSparklines.left - marginSparklines.right;
    height = height - marginSparklines.top - marginSparklines.bottom;

    var xScale = setupBinScale(type, width, numBins);
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



//////////////////////////////////////////////////////////////////////////////
// Side Panel
//////////////////////////////////////////////////////////////////////////////

// TODO: Move active filters out of histogram Brush.
// Should we still keep details inside for rendering?
function updateHistogramFilters (attr, id, firstBin, lastBin, redraw) {

    histogramFilters[attr] = {
        firstBin: firstBin,
        lastBin: lastBin,
        redraw: redraw
    };

    var stats = globalStatsCache.sparkLines[attr];
    var dataType = stats.dataType;

    if (stats.type === 'histogram') {
        var start = stats.minValue + (stats.binWidth * firstBin);
        var stop = stats.minValue + (stats.binWidth * lastBin) + stats.binWidth;
        histogramFilters[attr].start = start;
        histogramFilters[attr].stop = stop;
    } else {
        var list = [];
        // TODO: Determine if this order is deterministic,
        // and if not, explicitly send over a bin ordering from aggregate.
        var binNames = _.keys(stats.bins);
        for (var i = firstBin; i <= lastBin; i++) {
            list.push(binNames[i]);
        }
        histogramFilters[attr].equals = list;
    }
    histogramFilters[attr].type = dataType;

    $('.refreshHistogramButton-'+id).css('display', 'block');
}




function toggleExpandedD3 (attribute, vizContainer, vizHeight, view) {
    d3DataMap[attribute].svg.selectAll('*').remove();
    vizContainer.empty();
    vizContainer.height(String(vizHeight) + 'px');

    var sparkLines = view.model.get('sparkLines');
    if (sparkLines) {
        view.model.set('sparkLines', !sparkLines);
        initializeHistogramViz(vizContainer, view.model);
        updateAttribute(attribute, attribute, 'histogram');
    } else {
        view.model.set('sparkLines', !sparkLines);
        initializeSparklineViz(vizContainer, view.model);
        updateAttribute(attribute, attribute, 'sparkLines');
    }
}

function updateAttribute(oldAttr, newAttr, type) {
    updateAttributeSubject.onNext({
        oldAttr: oldAttr,
        newAttr: newAttr,
        type: type
    });
}


module.exports = {
    initHistograms: initHistograms,
    NUM_SPARKLINES: NUM_SPARKLINES
};


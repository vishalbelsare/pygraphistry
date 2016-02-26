'use strict';

// var debug   = require('debug')('graphistry:StreamGL:graphVizApp:HistogramsPanel');
var $       = window.$;
var Rx      = require('rxjs/Rx.KitchenSink');
              require('../rx-jquery-stub');
var _       = require('underscore');
var Handlebars = require('handlebars');
var Backbone = require('backbone');
    Backbone.$ = $;
var d3 = require('d3');

var util    = require('./util.js');
var contentFormatter = require('./contentFormatter.js');


//////////////////////////////////////////////////////////////////////////////
// CONSTANTS
//////////////////////////////////////////////////////////////////////////////

// var MODE = 'countBy';
// var MODE = 'default';
var DIST = false;
var DRAG_SAMPLE_INTERVAL = 200;
var BAR_THICKNESS = 16;
var SPARKLINE_HEIGHT = 65;
var SPARKLINE_BACKGROUND_HEIGHT = 5;
var NUM_SPARKLINES = 30;
var NUM_COUNTBY_SPARKLINES = NUM_SPARKLINES - 1;
var NUM_COUNTBY_HISTOGRAM = NUM_COUNTBY_SPARKLINES;

var DefaultHistogramBarFillColor = '#FCFCFC';
var FilterHistogramBarFillColor = '#556ED4';

//////////////////////////////////////////////////////////////////////////////
// Globals for updates
//////////////////////////////////////////////////////////////////////////////

var FullOpacity = 1;
//var PartialOpacity = 0.5;
var SelectedOpacity = 0.25;
var Transparent = 0;

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


//////////////////////////////////////////////////////////////////////////////
// Models
//////////////////////////////////////////////////////////////////////////////

// Setup Backbone for the brushing histogram
var HistogramModel = Backbone.Model.extend({
    getHistogramData: function (attributeName, type) {
        if (attributeName === undefined) {
            attributeName = this.get('attribute');
        }
        if (type === undefined) {
            type = this.get('type');
        }
        var histogramsByName = this.get('globalStats').histograms;
        if (histogramsByName.hasOwnProperty(attributeName)) {
            return histogramsByName[attributeName];
        } else if (type !== undefined) {
            return histogramsByName[type + ':' + attributeName];
        } else if (histogramsByName.hasOwnProperty('point:' + attributeName)) {
            return histogramsByName['point:' + attributeName];
        } else {
            return histogramsByName['edge:' + attributeName];
        }
    },
    getSparkLineData: function () {
        var sparkLinesByName = this.get('globalStats').sparkLines,
            attributeName = this.get('attribute'),
            type = this.get('type');
        if (sparkLinesByName.hasOwnProperty(attributeName)) {
            return sparkLinesByName[attributeName];
        } else if (type !== undefined) {
            return sparkLinesByName[type + ':' + attributeName];
        } else if (sparkLinesByName.hasOwnProperty('point:' + attributeName)) {
            return sparkLinesByName['point:' + attributeName];
        } else {
            return sparkLinesByName['edge:' + attributeName];
        }
    }
});

var HistogramCollection = Backbone.Collection.extend({
    model: HistogramModel,
    comparator: 'position'
});

/**
 * @param globalStats
 * @param {FiltersPanel} filtersPanel
 * @param attrChangeSubject
 * @param updateAttributeSubject
 * @constructor
 */
function HistogramsPanel(globalStats, filtersPanel,
                         attrChangeSubject, updateAttributeSubject) {
    this.filtersPanel = filtersPanel;
    // How the model-view communicate back to underlying Rx.
    this.dataframeAttributeChange = attrChangeSubject;
    this.updateAttributeSubject = updateAttributeSubject;
    /** Histogram-specific/owned filter information, keyed/unique per attribute. */
    this.histogramFilters = {};

    var $histogram = $('#histogram');

    this.histograms = new HistogramCollection();
    var panel = this;

    var attributes = _.filter(_.keys(globalStats.histograms), function (val) {
        return (val !== '_title');
    });

    // TODO: Replace this with a proper data transfer through the HTML5
    // drag and drop spec. It seems to be pretty broken outside of firefox,
    // so will not be using today.
    var lastDraggedCid;

    var HistogramView = Backbone.View.extend({
        tagName: 'div',
        className: 'histogramDiv',

        events: {
            'click .closeHistogramButton': 'close',
            'click .expandHistogramButton': 'expand',
            'click .expandedHistogramButton': 'shrink',
            'click .refreshHistogramButton': 'refresh',
            'click .encode-attribute': 'encode',
            'dragstart .topMenu': 'dragStart'
        },

        initialize: function () {
            this.listenTo(this.model, 'destroy', this.remove);
            this.listenTo(this.model, 'change:timeStamp', this.render);
            this.listenTo(this.model, 'change:encodingType', this.render);
            var params = {
                fields: attributes,
                attribute: this.model.get('attribute'),
                modelId: this.model.cid,
                id: this.cid
            };

            this.template = Handlebars.compile($('#histogramTemplateNoDropdown').html());
            var html = this.template(params);
            this.$el.html(html);
            this.$el.attr('cid', this.cid);
        },

        render: function () {
            // TODO: Wrap updates into render
            var histogram = this.model;

            // TODO: Don't have a 'sparkLines' boolean in the model, but a general vizType field.
            if (histogram.get('d3Data') && ((histogram.get('d3Data').vizType === 'sparkLines') === histogram.get('sparkLines'))) {
                if (histogram.get('sparkLines')) {
                    panel.updateSparkline(histogram.get('vizContainer'), histogram, histogram.get('attribute'));
                } else {
                    panel.updateHistogram(histogram.get('vizContainer'), histogram, histogram.get('attribute'));
                }
                return this;
            }

            var attribute = histogram.get('attribute');
            histogram.set('$el', this.$el); // TODO: Do we ever use this attribute?
            var vizContainer = this.$el.children('.vizContainer');
            histogram.set('vizContainer', vizContainer); // TODO: Do we ever use this attribute?

            var vizHeight = SPARKLINE_HEIGHT;
            histogram.set('d3Data', {});
            if (histogram.get('sparkLines')) {
                vizContainer.height(String(vizHeight) + 'px');
                initializeSparklineViz(vizContainer, histogram); // TODO: Link to data?
                panel.updateSparkline(vizContainer, histogram, attribute);
            } else {
                var histogramData = histogram.getHistogramData();
                vizHeight = histogramData.numBins * BAR_THICKNESS + margin.top + margin.bottom;
                vizContainer.height(String(vizHeight) + 'px');
                initializeHistogramViz(vizContainer, histogram); // TODO: Link to data?
                panel.updateHistogram(vizContainer, histogram, attribute);
            }

            if (!$.urlParam('beta')) {
                $('.encode-attribute', this.$el).hide();
            }
            $('[data-toggle="tooltip"]', this.$el).tooltip();

            return this;
        },

        encode: function (evt) {
            var target = $(evt.currentTarget);
            var encodingSpec = {
                encodingType: 'color',
                variation: undefined
            };
            if (target.hasClass('encode-size')) {
                encodingSpec.encodingType = 'size';
                encodingSpec.variation = 'quantitative';
            } else if (target.hasClass('encode-color-quantitative')) {
                encodingSpec.encodingType = 'color';
                encodingSpec.variation = 'quantitative';
            } else if (target.hasClass('encode-color-categorical')) {
                encodingSpec.encodingType = 'color';
                encodingSpec.variation = 'categorical';
            }
            var isEncoded = this.model.get('encodingType') !== undefined;
            var dataframeAttribute = this.model.get('attribute');
            var binning = this.model.getSparkLineData();
            panel.encodeAttribute(dataframeAttribute, encodingSpec, isEncoded, binning).take(1).do(function (response) {
                if (response.enabled) {
                    panel.assignEncodingTypeToHistogram(response.encodingType, this.model, response.legend);
                } else {
                    this.model.set('legend', undefined);
                    this.model.set('encodingType', undefined);
                }
            }.bind(this)).subscribe(_.identity, util.makeErrorHandler('Encoding histogram attribute'));
        },

        dragStart: function () {
            lastDraggedCid = this.cid;
        },

        shrink: function (evt) {
            $(evt.target).removeClass('expandedHistogramButton').addClass('expandHistogramButton');
            $(evt.target).removeClass('fa-caret-right').addClass('fa-caret-down');
            var vizContainer = this.model.get('vizContainer');
            var attribute = this.model.get('attribute');
            var d3Data = this.model.get('d3Data');
            var vizHeight = SPARKLINE_HEIGHT;
            d3Data.svg.selectAll('*').remove();
            vizContainer.empty();
            vizContainer.height(String(vizHeight) + 'px');
            this.model.set('sparkLines', true);
            panel.updateAttribute(attribute, attribute, 'sparkLines');
        },

        expand: function (evt) {
            $(evt.target).removeClass('expandHistogramButton').addClass('expandedHistogramButton');
            $(evt.target).removeClass('fa-caret-down').addClass('fa-caret-right');
            var vizContainer = this.model.get('vizContainer');
            var attribute = this.model.get('attribute');
            var d3Data = this.model.get('d3Data');
            var histogram = this.model.getHistogramData();
            var numBins = (histogram.type === 'countBy') ? Math.min(NUM_COUNTBY_HISTOGRAM, histogram.numBins) : histogram.numBins;
            var vizHeight = numBins * BAR_THICKNESS + margin.top + margin.bottom;
            d3Data.svg.selectAll('*').remove();
            vizContainer.empty();
            vizContainer.height(String(vizHeight) + 'px');
            this.model.set('sparkLines', false);
            panel.updateAttribute(attribute, attribute, 'histogram');
        },

        refresh: function () {
            var attribute = this.model.get('attribute');
            var id = this.model.cid;
            $('.refreshHistogramButton-' + id).css('visibility', 'hidden');
            panel.deleteHistogramFilterByAttribute(attribute);
            panel.updateFiltersFromHistogramFilters();
            this.render();
        },

        close: function () {
            if (panel.histogramFilters[this.model.get('attribute')]) {
                this.refresh();
            }
            this.$el.remove();
            panel.histograms.remove(this.model);
        }
    });


    var AllHistogramsView = Backbone.View.extend({
        el: $histogram,
        histogramsContainer: $('#histograms'),
        events: {
            'click .addHistogramDropdownField': 'addHistogramFromDropdown'
        },
        initialize: function () {
            var that = this;
            this.listenTo(panel.histograms, 'add', this.addHistogram);
            this.listenTo(panel.histograms, 'remove', this.removeHistogram);
            this.listenTo(panel.histograms, 'reset', this.addAll);

            // Setup add histogram button.
            var template = Handlebars.compile($('#addHistogramTemplate').html());
            var params = { fields: attributes };
            var html = template(params);
            $('#addHistogram').html(html);

            // Setup drag drop interactions.
            $histogram.on('dragover', function (evt) {
                evt.preventDefault();
            });
            $histogram.on('drop', function (evt) {
                var srcCid = lastDraggedCid;
                var destCid = $(evt.target).parents('.histogramDiv').attr('cid');
                that.moveHistogram(srcCid, destCid);
            });
        },
        render: function () {
            // Re-render by showing the histograms in correct sorted order.
            this.collection.sort();
            var newDiv = $('<div></div>');
            this.collection.each(function (child) {
                newDiv.append(child.view.el);
            });

            $(this.histogramsContainer).empty();
            $(this.histogramsContainer).append(newDiv);
        },
        moveHistogram: function (fromCID, toCID) {
            // var length = this.collection.length;
            var srcIdx,
                dstIdx;
            this.collection.each(function (hist, i) {
                if (hist.view.cid === fromCID) { srcIdx = i; }
                if (hist.view.cid === toCID) { dstIdx = i; }
            });

            if (srcIdx === dstIdx) {
                return;
            }

            // TODO: Do this in a clean way that isn't obscure as all hell.
            var min = Math.min(srcIdx, dstIdx);
            var max = Math.max(srcIdx, dstIdx);
            this.collection.each(function (hist, i) {
                if (i > max || i < min) {
                    hist.set('position', i);
                    return;
                }
                if (srcIdx < dstIdx) {
                    if (i === srcIdx) {
                        hist.set('position', dstIdx);
                    } else {
                        hist.set('position', i - 1);
                    }
                } else {
                    if (i === dstIdx) {
                        hist.set('position', i);
                    } else if (i === srcIdx) {
                        hist.set('position', dstIdx + 1);
                    } else {
                        hist.set('position', i + 1);
                    }
                }
            });
            this.render();
        },
        addHistogram: function (histogram) {
            // There's a slight quirk here due to using D3, where we need to make sure
            // that the view doesn't get rendered until it's attached to the container.
            // If it isn't attached yet, it has zero size, and D3 freaks out.
            var view = new HistogramView({model: histogram});
            histogram.view = view;
            $(this.histogramsContainer).append(view.el);
            view.render();
        },
        removeHistogram: function (histogram) {
            panel.updateAttribute(histogram.get('attribute'));
        },
        addHistogramFromDropdown: function (evt) {
            var attribute = $(evt.currentTarget).text().trim();
            panel.updateAttribute(null, attribute, 'sparkLines');
        },
        addAll: function () {
            $(this.histogramsContainer).empty();
            panel.histograms.each(this.addHistogram, this);
        }
    });

    this.view = new AllHistogramsView({collection: panel.histograms});
    panel.collection = this.histograms;
    panel.model = HistogramModel;
}

HistogramsPanel.prototype.updateAttribute = function (oldAttr, newAttr, type) {
    this.updateAttributeSubject.onNext({
        oldAttr: oldAttr,
        newAttr: newAttr,
        type: type
    });
};

HistogramsPanel.prototype.encodeAttribute = function (dataframeAttribute, encodingSpec, reset, binning) {
    return this.filtersPanel.control.encodeCommand.sendWithObservableResult({
        attribute: dataframeAttribute,
        encodingType: encodingSpec.encodingType,
        variation: encodingSpec.variation,
        reset: reset,
        binning: binning
    });
};

HistogramsPanel.prototype.setupApiInteraction = function (apiActions) {
    //FIXME should route all this via Backbone calls, not DOM
    apiActions
        .filter(function (command) { return command.event === 'encode'; })
        .do(function (command) {
            console.log('adding hist panel', command.attribute);
            this.updateAttribute(null, command.attribute, 'sparkLines');
        }.bind(this))
        .flatMap(function (command) {
            //poll until exists on DOM & return
            return Rx.Observable.interval(10).timeInterval()
                .map(function () {
                    return $('.histogramDiv .attributeName')
                        .filter(function() {
                            return $(this).text() === command.attribute;
                        }).parents('.histogramDiv');
                }.bind(this))
                .filter(function ($hist) { return $hist.length; })
                .take(1)
                .do(function ($histogramPanel) {
                    console.log('made, encoding', $histogramPanel);
                    this.encodeAttribute(command.attribute, command.encodingType);
                    var route =  {
                        'size': {
                            'quantitative': '.encode-size',
                            'categorical': '.encode-size'
                        },
                        'color': {
                            'quantitative': '.encode-color-quantitative',
                            'categorical': '.encode-color-categorical'
                        }
                    };
                    var routed = route[command.encodingType][command.variation];
                    var $i = $(routed, $histogramPanel);
                    $i[0].click();
                    console.log('clicked on', $i, routed);
                }.bind(this));
        }.bind(this))
        .subscribe(_.identity, util.makeErrorHandler('HistogramsPanel.setupApiInteractions'));
};


HistogramsPanel.prototype.assignEncodingTypeToHistogram = function (encodingType, model, legend) {
    if (model !== undefined) {
        model.set('legend', legend);
        model.set('encodingType', encodingType);
    }
    this.histograms.each(function (histogram) {
        if (histogram !== model && histogram.get('encodingType') === encodingType) {
            histogram.set('legend', undefined);
            histogram.set('encodingType', undefined);
        }
    });
};


// These manage the FilterPanel's filters according to the histogram UI:

/** This identifies a filter that is designated a histogram filter for the same
 * dataframe attribute. Very strict match.
 * @param {String} dataframeAttribute
 * @returns {FilterModel}
 */
HistogramsPanel.prototype.findFilterForHistogramFilter = function (dataframeAttribute) {
    return this.filtersPanel.collection.findWhere({
        attribute: dataframeAttribute,
        controlType: 'histogram'});
};

HistogramsPanel.prototype.deleteHistogramFilterByAttribute = function (dataframeAttribute) {
    var filter = this.findFilterForHistogramFilter(dataframeAttribute);
    if (filter !== undefined) {
        this.filtersPanel.collection.remove(filter);
    }
    delete this.histogramFilters[dataframeAttribute];
};

/**
 * This updates histogram filter structures from ASTs.
 * We should maintain only expression objects instead.
 * We should also use structural pattern matching...
 */
function updateHistogramFilterFromExpression(histFilter, ast) {
    var op;
    histFilter.equals = undefined;
    histFilter.start = undefined;
    histFilter.stop = undefined;
    if (ast.type === 'BetweenPredicate') {
        if (ast.start.type === 'Literal') {
            histFilter.start = ast.start.value;
        }
        if (ast.stop.type === 'Literal') {
            histFilter.stop = ast.stop.value;
        }
    } else if (ast.type === 'BinaryPredicate') {
        op = ast.operator.toUpperCase();
        if (op === 'IN') {
            var containerExpr = ast.right;
            if (containerExpr.type === 'ListExpression') {
                histFilter.equals = _.map(containerExpr.elements, function (element) {
                    return element.type === 'Literal' ? element.value : undefined;
                });
            }
        }
    } else if (ast.type === 'BinaryExpression') {
        op = ast.operator.toUpperCase();
        switch (op) {
            case '=':
            case '==':
                if (ast.right.type === 'Literal') {
                    histFilter.equals = ast.right.value;
                } else if (ast.left.type === 'Literal') {
                    histFilter.equals = ast.left.value;
                }
                break;
            case '>':
            case '>=':
                if (ast.right.type === 'Literal') {
                    histFilter.start = ast.right.value;
                } else if (ast.left.type === 'Literal') {
                    histFilter.stop = ast.left.value;
                }
                break;
            case '<':
            case '<=':
                if (ast.right.type === 'Literal') {
                    histFilter.stop = ast.right.value;
                } else if (ast.left.type === 'Literal') {
                    histFilter.start = ast.left.value;
                }
                break;
        }
    }
}

HistogramsPanel.prototype.updateHistogramFiltersFromFiltersSubject = function () {
    var histogramFiltersToRemove = {};
    _.each(this.histogramFilters, function (histFilter, attribute) {
        if (!attribute) {
            attribute = histFilter.attribute;
        }
        var matchingFilter = this.findFilterForHistogramFilter(attribute);
        if (matchingFilter === undefined) {
            histogramFiltersToRemove[attribute] = histFilter;
        } else {
            // Update histogram filter from filter:
            var query = matchingFilter.query;
            if (query.ast !== undefined) {
                updateHistogramFilterFromExpression(histFilter, query.ast);
            }
            _.extend(histFilter, _.pick(query, ['start', 'stop', 'equals']));
        }
    }, this);
    _.each(histogramFiltersToRemove, function (histFilter, attribute) {
        delete this.histogramFilters[attribute];
    }, this);
};

HistogramsPanel.prototype.updateFiltersFromHistogramFilters = function () {
    var filtersCollection = this.filtersPanel.collection;
    var filterer = this.filtersPanel.control;
    _.each(this.histogramFilters, function (histFilter, attribute) {
        if (!attribute) {
            attribute = histFilter.attribute;
        }
        var query = {};
        // Should be histFilter.dataType:
        var dataType;
        if (histFilter.start !== undefined || histFilter.stop !== undefined) {
            query = filterer.filterRangeParameters(
                histFilter.type,
                attribute,
                histFilter.start,
                histFilter.stop);
            dataType = 'float';
        } else if (histFilter.equals !== undefined) {
            if (histFilter.equals.hasOwnProperty('length')) {
                if (histFilter.equals.length > 1) {
                    query = filterer.filterExactValuesParameters(
                        histFilter.type,
                        attribute,
                        histFilter.equals
                    );
                } else {
                    query = filterer.filterExactValueParameters(
                        histFilter.type,
                        attribute,
                        histFilter.equals[0]
                    );
                }
            } else {
                query = filterer.filterExactValueParameters(
                    histFilter.type,
                    attribute,
                    histFilter.equals
                );
            }
            // Leave blank until/if we can determine this better?
            dataType = histFilter.type || 'string';
        }
        if (histFilter.ast !== undefined) {
            query.ast = histFilter.ast;
        }
        var matchingFilter = this.findFilterForHistogramFilter(attribute);
        if (matchingFilter === undefined) {
            filtersCollection.addFilter({
                attribute: attribute,
                controlType: 'histogram',
                dataType: dataType,
                histogramControl: histFilter,
                query: query
            });
        } else {
            // Assume that only interaction has happened, only update the query for now:
            matchingFilter.set('query', query);
        }
    }, this);
};


//////////////////////////////////////////////////////////////////////////////
// Histogram Widget
//////////////////////////////////////////////////////////////////////////////

function toStackedObject(local, total, idx, name, attr, numLocal, numTotal, distribution) {
    var stackedObj;
    // If we want to normalize to a distribution as percentage of total.
    // TODO: Finish implementing this...
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
    stackedObj.name = name;
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
    var binValues = globalStats.binValues;
    var dataType = globalStats.dataType;
    var name;
    var localFormat = function (value) {
        return contentFormatter.shortFormat(value, dataType);
    };
    if (type === 'countBy') {
        var globalKeys = _.keys(globalBins);
        _.each(_.range(Math.min(globalKeys.length, limit)), function (idx) {
            var key = globalKeys[idx];
            var local = bins[key] || 0;
            var total = globalBins[key];
            var binDescription;
            if (key === '_other' && binValues && binValues._other) {
                binDescription = binValues._other;
                name = '(Another ' + localFormat(binDescription.numValues) + ' values)';
            } else if (binValues && binValues[idx]) {
                binDescription = binValues[idx];
                if (binDescription.isSingular) {
                    name = localFormat(binDescription.representative);
                } else if (binDescription.min !== undefined) {
                    name = localFormat(binDescription.min) + ' : ' + localFormat(binDescription.max);
                }
            } else {
                name = key;
            }
            var stackedObj = toStackedObject(local, total, idx, name, attr, numLocal, numTotal, distribution);
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
            if (binValues && binValues[idx]) {
                var binDescription = binValues[idx];
                if (binDescription.isSingular) {
                    name = localFormat(binDescription.representative);
                } else if (binDescription.min !== undefined) {
                    name = localFormat(binDescription.min) + ' : ' + localFormat(binDescription.max);
                }
            } else {
                var start = globalStats.minValue + (globalStats.binWidth * idx);
                var stop = start + globalStats.binWidth;
                name = localFormat(start) + ' : ' + localFormat(stop);
            }
            var stackedObj = toStackedObject(local, total, idx, name, attr, numLocal, numTotal, distribution);
            stackedBins.push(stackedObj);
        });
    }
    return stackedBins;
}


HistogramsPanel.prototype.highlight = function (selection, toggle) {
    _.each(selection[0], function (sel) {
        var data = sel.__data__;
        var colorWithoutHighlight;
        if (this.histogramFilters[data.attr] !== undefined) {
            var min = this.histogramFilters[data.attr].firstBin;
            var max = this.histogramFilters[data.attr].lastBin;
            if (data.binId >= min && data.binId <= max) {
                colorWithoutHighlight = color;
            } else {
                colorWithoutHighlight = colorUnselected;
            }
        } else {
            colorWithoutHighlight = color;
        }

        var colorScale = (toggle) ? colorHighlighted : colorWithoutHighlight;
        $(sel).css('fill', colorScale(data.type));
    }, this);
};

HistogramsPanel.prototype.updateHistogram = function ($el, model, attribute) {
    var height = $el.height() - margin.top - margin.bottom;
    var width = $el.width() - margin.left - margin.right;
    var data = model.get('data');
    var globalStats = model.getHistogramData(attribute);
    var bins = data.bins || []; // Guard against empty bins.
    var type = (data.type && data.type !== 'nodata') ? data.type : globalStats.type;
    var d3Data = model.get('d3Data');
    var numBins = (type === 'countBy' ? Math.min(NUM_COUNTBY_HISTOGRAM, globalStats.numBins) : globalStats.numBins);
    data.numValues = data.numValues || 0;

    var svg = d3Data.svg;
    var xScale = d3Data.xScale;
    var yScale = d3Data.yScale;

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
            .attr('opacity', Transparent)
            .on('mouseover', this.toggleTooltips.bind(this, true, svg))
            .on('mouseout', this.toggleTooltips.bind(this, false, svg));


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


    this.applyAttrBars(bars.enter().append('rect'), 'bottom', 'top')
        .attr('class', 'bar-rect')
        .attr('height', barHeight)
        .attr('width', function (d) {
            return xScale(d.y0) - xScale(d.y1) + heightDelta(d, xScale);
        })
        .attr('x', function (d) {
            return xScale(d.y1) - heightDelta(d, xScale);
        });
};


HistogramsPanel.prototype.updateSparkline = function ($el, model, attribute) {
    var width = $el.width() - marginSparklines.left - marginSparklines.right;
    var height = $el.height() - marginSparklines.top - marginSparklines.bottom;
    var data = model.get('data');
    var id = model.cid;
    var globalStats = model.getSparkLineData();
    var bins = data.bins || []; // Guard against empty bins.
    var type = (data.type && data.type !== 'nodata') ? data.type : globalStats.type;
    var d3Data = model.get('d3Data');
    var numBins = (type === 'countBy' ? Math.min(NUM_COUNTBY_SPARKLINES, globalStats.numBins) : globalStats.numBins);
    data.numValues = data.numValues || 0;

    var svg = d3Data.svg;
    var xScale = d3Data.xScale;
    var yScale = d3Data.yScale;

    var barPadding = 1;
    var stackedBins = toStackedBins(bins, globalStats, type, attribute, data.numValues, globalStats.numValues,
            DIST, (type === 'countBy' ? NUM_COUNTBY_SPARKLINES : 0));

    // var barWidth = (type === 'countBy') ? xScale.rangeBand() : Math.floor(width/numBins) - barPadding;
    var barWidth = (type === 'countBy') ? xScale.rangeBand() : (width / numBins) - barPadding;

    // TODO: Is there a way to avoid this bind? What is the backbone way to do this?
    var filterRedrawCallback = model.view.render.bind(model.view);


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
        .attr('opacity', Transparent)
        .attr('fill', color('global'))
        .attr('font-size', '0.7em');

    var upperTooltip = svg.selectAll('.upperTooltip')
        .data([''])
        .enter().append('text')
        .attr('class', 'upperTooltip')
        .attr('y', -4)
        .attr('x', 0)
        .attr('opacity', Transparent)
        .attr('font-size', '0.7em');

    upperTooltip.selectAll('.globalTooltip').data([''])
        .enter().append('tspan')
        .attr('class', 'globalTooltip')
        .attr('fill', colorHighlighted('global'))
        .text('global, ');

    upperTooltip.selectAll('.localTooltip').data([''])
        .enter().append('tspan')
        .attr('class', 'localTooltip')
        .attr('fill', colorHighlighted('local'))
        .text('local');

    //////////////////////////////////////////////////////////////////////////
    // Create Columns
    //////////////////////////////////////////////////////////////////////////

    var histogramFilters = this.histogramFilters;
    var histFilter = histogramFilters[attribute];

    var updateOpacity = function (d, i) {
        if (histFilter && i >= histFilter.firstBin && i <= histFilter.lastBin) {
            return SelectedOpacity;
        } else {
            return FullOpacity;
        }
    };
    var updateCursor = function (d, i) {
        if (histFilter && i >= histFilter.firstBin && i <= histFilter.lastBin && histFilter.completed) {
            return 'pointer';
        } else {
            return 'crosshair';
        }
    };
    var encodingType = model.get('encodingType'),
        encodesColor = encodingType !== undefined && encodingType.search(/Color$/) !== -1;
    var legend = model.get('legend');
    var updateColumnColor = function (d, i) {
        if (histFilter && i >= histFilter.firstBin && i <= histFilter.lastBin) {
            return FilterHistogramBarFillColor;
        } else if (encodesColor && legend && legend[i] !== undefined && legend[i] !== null) {
            return legend[i];
        } else {
            return DefaultHistogramBarFillColor;
        }
    };


    var columns = selectColumns(svg, stackedBins);
    var columnRectangles = svg.selectAll('.column-rect');
    columnRectangles.attr('opacity', updateOpacity)
        .style('cursor', updateCursor)
        .attr('fill', updateColumnColor);

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
            .attr('fill', updateColumnColor)
            .attr('opacity', updateOpacity)
            .style('cursor', updateCursor)
            .on('mousedown', this.handleHistogramDown.bind(this, filterRedrawCallback, id, model.get('globalStats')))
            .on('mouseover', this.toggleTooltips.bind(this, true, svg))
            .on('mouseout', this.toggleTooltips.bind(this, false, svg));

    //////////////////////////////////////////////////////////////////////////
    // Create and Update Bars
    //////////////////////////////////////////////////////////////////////////

    var bars = selectBars(columns)
        .style('fill', this.reColor.bind(this));

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


    this.applyAttrBars(bars.enter().append('rect'), 'left', 'right')
        .attr('class', 'bar-rect')
        .attr('width', barWidth)
        .attr('transform', 'translate(0,' + SPARKLINE_BACKGROUND_HEIGHT + ')')
        .attr('height', function (d) {
            return yScale(d.y0) - yScale(d.y1) + heightDelta(d, yScale);
        })
        .attr('y', function (d) {
            return yScale(d.y1) - heightDelta(d, yScale);
        });

};

function binInLastFilter(lastHistogramFilter, binNum) {
    return (lastHistogramFilter &&
        (lastHistogramFilter.firstBin <= binNum && lastHistogramFilter.lastBin >= binNum));
}

HistogramsPanel.prototype.handleHistogramDown = function (redrawCallback, id, globalStats) {
    var col = d3.select(d3.event.target.parentNode);
    var $element = $(col[0][0]);
    var $parent = $element.parent();

    var startBin = +($element.attr('binnumber')); // Cast to number from string
    var attr = $element.attr('attribute');
    var numBins = globalStats.sparkLines[attr].numBins;
    var lastHistogramFilter = this.histogramFilters[attr];
    this.updateHistogramFilters(attr, id, globalStats, startBin, startBin);

    var startedInLastFilter = binInLastFilter(lastHistogramFilter, startBin);
    var mouseMoved = false;

    var positionChanges = Rx.Observable.fromEvent($parent, 'mouseover')
        .map(function (evt) {
            var $col = $(evt.target).parent();
            var binNum = $col.attr('binnumber');

            var firstBin, lastBin;
            if (startedInLastFilter) {
                // User is dragging an existing window
                var delta = binNum - startBin;
                // Guard delta so that window doesn't go off the edge.
                if (lastHistogramFilter.firstBin + delta < 0) {
                    delta = 0 - lastHistogramFilter.firstBin;
                } else if (lastHistogramFilter.lastBin + delta >= numBins) {
                    delta = numBins - 1 - lastHistogramFilter.lastBin;
                }

                firstBin = lastHistogramFilter.firstBin + delta;
                lastBin = lastHistogramFilter.lastBin + delta;
            } else {
                // User is drawing a new window
                var ends = [+startBin, +binNum];
                firstBin = _.min(ends);
                lastBin = _.max(ends);
            }

            mouseMoved = true;
            this.updateHistogramFilters(attr, id, globalStats, firstBin, lastBin);
            this.updateFiltersFromHistogramFilters();
            redrawCallback();
        }, this).subscribe(_.identity, util.makeErrorHandler('Histogram Filter Dragging'));

    Rx.Observable.fromEvent($(document.body), 'mouseup')
        .take(1)
        .do(function () {
            positionChanges.dispose();
            this.histogramFilters[attr].completed = true;

            // Click on selection, so undo all filters.
            if (startedInLastFilter &&  !mouseMoved) {
                this.deleteHistogramFilterByAttribute(attr);
            }

            this.updateFiltersFromHistogramFilters();
            redrawCallback();
        }.bind(this))
        .subscribe(_.identity, util.makeErrorHandler('Histogram Filter Mouseup'));
};

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

HistogramsPanel.prototype.reColor = function (d) {
    if (this.histogramFilters[d.attr] !== undefined) {
        var min = this.histogramFilters[d.attr].firstBin;
        var max = this.histogramFilters[d.attr].lastBin;
        if (d.binId >= min && d.binId <= max) {
            return color(d.type);
        } else {
            return colorUnselected(d.type);
        }
    } else {
        return color(d.type);
    }
};

HistogramsPanel.prototype.applyAttrBars = function (bars, globalPos, localPos) {
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
        .style('fill', this.reColor.bind(this));
};

HistogramsPanel.prototype.toggleTooltips = function (showTooltip, svg) {
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
        tooltipBox.attr('opacity', FullOpacity);
    } else {
        globalTooltip.text('');
        localTooltip.text('');
        tooltipBox.attr('opacity', Transparent);
    }


    var textBox = svg.select('.lowerTooltip');
    if (showTooltip) {
        textBox.text(data.name);
        textBox.attr('opacity', FullOpacity);
    } else {
        textBox.text('');
        textBox.attr('opacity', Transparent);
    }

    this.highlight(bars, showTooltip);
};

function heightDelta(d, xScale) {
    var minimumHeight = 5;
    var height = xScale(d.y0) - xScale(d.y1);
    if (d.val > 0 && d.y0 === 0 && height < minimumHeight) {
        return minimumHeight - height;
    } else {
        return 0;
    }
}

function initializeHistogramViz($el, model) {
    var width = $el.width();
    var height = $el.height(); // TODO: Get this more naturally.
    var data = model.get('data');
    var id = model.cid;
    var attribute = model.get('attribute');
    var globalStats = model.getHistogramData();
    var bins = data.bins || []; // Guard against empty bins.
    var type = (data.type && data.type !== 'nodata') ? data.type : globalStats.type;
    var d3Data = model.get('d3Data');
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
            var fullTitle;
            if (type === 'countBy') {
                fullTitle = contentFormatter.defaultFormat(stackedBins[d].name, globalStats.dataType);
                fullTitles[d] = fullTitle;
                return contentFormatter.shortFormat(stackedBins[d].name, globalStats.dataType);
            } else {
                fullTitle = contentFormatter.defaultFormat(d * globalStats.binWidth + globalStats.minValue, globalStats.dataType);
                fullTitles[d] = fullTitle;
                return contentFormatter.defaultFormat(d * globalStats.binWidth + globalStats.minValue, globalStats.dataType);
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

    _.extend(d3Data, {
        vizType: 'histogram',
        xScale: xScale,
        yScale: yScale,
        svg: svg
    });
}

function initializeSparklineViz($el, model) {
    var width = $el.width();
    var height = $el.height();
    var data = model.get('data');
    var attribute = model.get('attribute');
    var globalStats = model.getSparkLineData();
    var bins = data.bins || []; // Guard against empty bins.
    var type = (data.type && data.type !== 'nodata') ? data.type : globalStats.type;
    var d3Data = model.get('d3Data');
    var numBins = (type === 'countBy' ? Math.min(NUM_COUNTBY_SPARKLINES, globalStats.numBins) : globalStats.numBins);
    data.numValues = data.numValues || 0;

    // Transform bins and global bins into stacked format.
    var stackedBins = toStackedBins(bins, globalStats, type, attribute, data.numValues, globalStats.numValues,
        DIST, (type === 'countBy' ? NUM_COUNTBY_SPARKLINES : 0));

    width = width - marginSparklines.left - marginSparklines.right;
    height = height - marginSparklines.top - marginSparklines.bottom;

    var xScale = setupBinScale(type, width, numBins);
    var yScale = setupAmountScale(height - SPARKLINE_BACKGROUND_HEIGHT, stackedBins, DIST);
    var svg = setupSvg($el[0], marginSparklines, width, height);

    _.extend(d3Data, {
        vizType: 'sparkLines',
        xScale: xScale,
        yScale: yScale,
        svg: svg
    });
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
            // .attr('class', 'crosshair-cursor')
            .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
}



//////////////////////////////////////////////////////////////////////////////
// Util
//////////////////////////////////////////////////////////////////////////////

/**
 * Retains histogram-control-specific filter details while allowing coordination with the underlying filter model.
 * @param {String} dataframeAttribute
 * @param {String} id
 * @param globalStats
 * @param {Number} firstBin index of first bin, inclusive
 * @param {Number} lastBin index of last bin, inclusive
 */
HistogramsPanel.prototype.updateHistogramFilters = function (dataframeAttribute, id, globalStats, firstBin, lastBin) {

    var updatedHistogramFilter = {
        firstBin: firstBin,
        lastBin: lastBin
    };

    var stats = globalStats.sparkLines[dataframeAttribute];
    var graphType = stats.graphType;

    var identifier = {type: 'Identifier', name: dataframeAttribute};
    if (stats.type === 'histogram') {
        updatedHistogramFilter.start = stats.minValue + (stats.binWidth * firstBin);
        updatedHistogramFilter.stop = stats.minValue + (stats.binWidth * lastBin) + stats.binWidth;
        updatedHistogramFilter.ast = {
            type: 'BetweenPredicate',
            start: {type: 'Literal', value: updatedHistogramFilter.start},
            stop: {type: 'Literal', value: updatedHistogramFilter.stop},
            value: identifier
        };
    } else if (stats.type === 'countBy') {
        var binValues = [];
        // TODO: Determine if this order is deterministic,
        // and if not, explicitly send over a bin ordering from aggregate.
        var binNames = _.keys(stats.bins);
        var isNumeric = _.isNumber(stats.minValue) && _.isNumber(stats.maxValue);
        var otherIsSelected = false;
        for (var i = firstBin; i <= lastBin; i++) {
            var binName = binNames[i];
            if (binName === '_other') {
                otherIsSelected = true;
                continue;
            }
            if (stats.binValues && stats.binValues[binName] !== undefined) {
                binName = stats.binValues[binName].representative;
            }
            binValues.push(isNumeric ? Number(binName) : binName);
        }
        updatedHistogramFilter.equals = binValues;
        var elements = _.map(binValues, function (x) {
            return {type: 'Literal', value: x};
        });
        if (elements.length > 1) {
            updatedHistogramFilter.ast = {
                type: 'BinaryPredicate',
                operator: 'IN',
                left: identifier,
                right: {type: 'ListExpression', elements: elements}
            };
        } else if (elements.length === 1) {
            updatedHistogramFilter.ast = {
                type: 'BinaryPredicate',
                operator: '=',
                left: identifier,
                right: elements[0]
            };
        }
        if (otherIsSelected) {
            var otherAST = {
                type: 'NotExpression',
                operator: 'NOT',
                value: {
                    type: 'BinaryPredicate',
                    operator: 'IN',
                    left: identifier,
                    right: {type: 'ListExpression', elements: _.map(binNames, function (x) {
                        return {type: 'Literal', value: x};
                    })}
                }
            };
            if (updatedHistogramFilter.ast === undefined) {
                updatedHistogramFilter.ast = otherAST;
            } else {
                updatedHistogramFilter.ast = {
                    type: 'BinaryPredicate',
                    operator: 'OR',
                    left: otherAST,
                    right: updatedHistogramFilter.ast
                };
            }
        }
    }
    // TODO rename type property to graphType for clarity.
    updatedHistogramFilter.type = graphType;
    this.histogramFilters[dataframeAttribute] = updatedHistogramFilter;

    $('.refreshHistogramButton-' + id).css('visibility', 'visible');
};


HistogramsPanel.NUM_SPARKLINES = NUM_SPARKLINES;


module.exports = HistogramsPanel;

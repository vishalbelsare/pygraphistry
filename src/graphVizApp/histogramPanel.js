'use strict';

// const debug   = require('debug')('graphistry:StreamGL:graphVizApp:HistogramsPanel');
const $       = window.$;
const Rx      = require('rxjs/Rx.KitchenSink');
import '../rx-jquery-stub';
const _       = require('underscore');
const Handlebars = require('handlebars');
const Backbone = require('backbone');
Backbone.$ = $;
const d3      = require('d3');

const util    = require('./util.js');
const Identifier = require('./Identifier');
const contentFormatter = require('./contentFormatter.js');
const ExpressionPrinter = require('./ExpressionPrinter.js');


//////////////////////////////////////////////////////////////////////////////
// CONSTANTS
//////////////////////////////////////////////////////////////////////////////

// const MODE = 'countBy';
// const MODE = 'default';
const DIST = false;
const DRAG_SAMPLE_INTERVAL = 200;
const BAR_THICKNESS = 16;
const HORIZONTAL_HEIGHT = 65;
const HORIZONTAL_BACKGROUND_HEIGHT = 5;
const MAX_HORIZONTAL_BINS = 30;
const MAX_HORIZONTAL_ELEMENTS = MAX_HORIZONTAL_BINS - 1;
const MAX_VERTICAL_ELEMENTS = MAX_HORIZONTAL_ELEMENTS;

const DefaultHistogramBarFillColor = '#FCFCFC';
const FilterHistogramBarFillColor = '#556ED4';

//////////////////////////////////////////////////////////////////////////////
// Globals for updates
//////////////////////////////////////////////////////////////////////////////

const FullOpacity = 1;
//const PartialOpacity = 0.5;
const SelectedOpacity = 0.25;
const Transparent = 0;

// TODO: Pull these into the created histogram object, away from globals.
const colorsByType = {
    local: '#0FA5C5',
    global: '#929292',
    globalSmaller: '#0FA5C5',
    localBigger: '#00BBFF'
};

const colorsUnselectedByType = {
    local: '#96D8E6',
    global: '#C8C8C8',
    globalSmaller: '#0FA5C5',
    localBigger: '#00BBFF'
};

const colorsHighlightedByType = {
    local: '#E35E13',
    global: '#6B6868',
    globalSmaller: '#E35E13',
    localBigger: '#FF3000'
};

const histogramMarginsVertical = {top: 10, right: 70, bottom: 20, left:20};
const histogramMarginsHorizontal = {top: 15, right: 10, bottom: 15, left: 10};


//////////////////////////////////////////////////////////////////////////////
// Models
//////////////////////////////////////////////////////////////////////////////

// Setup Backbone for the brushing histogram
const HistogramModel = Backbone.Model.extend({
    getHistogramData: function (attributeName, type) {
        if (attributeName === undefined) {
            attributeName = this.get('attribute');
        }
        if (type === undefined) {
            type = this.get('type');
        }
        const histogramsByName = this.get('globalStats').histograms;
        if (histogramsByName.hasOwnProperty(attributeName)) {
            return histogramsByName[attributeName];
        } else if (type !== undefined) {
            return histogramsByName[Identifier.clarifyWithPrefixSegment(attributeName, type)];
        } else {
            const pointPrefixAttribute = Identifier.clarifyWithPrefixSegment(attributeName, 'point');
            if (histogramsByName.hasOwnProperty(pointPrefixAttribute)) {
                return histogramsByName[pointPrefixAttribute];
            } else {
                return histogramsByName[Identifier.clarifyWithPrefixSegment(attributeName, 'edge')];
            }
        }
    },
    getSparkLineData: function () {
        const sparkLinesByName = this.get('globalStats').sparkLines,
            attributeName = this.get('attribute'),
            type = this.get('type');
        if (sparkLinesByName.hasOwnProperty(attributeName)) {
            return sparkLinesByName[attributeName];
        } else if (type !== undefined) {
            return sparkLinesByName[Identifier.clarifyWithPrefixSegment(attributeName, type)];
        } else {
            const pointPrefixAttribute = Identifier.clarifyWithPrefixSegment(attributeName, 'point');
            if (sparkLinesByName.hasOwnProperty(pointPrefixAttribute)) {
                return sparkLinesByName[pointPrefixAttribute];
            } else {
                return sparkLinesByName[Identifier.clarifyWithPrefixSegment(attributeName, 'edge')];
            }
        }
    }
});

const HistogramCollection = Backbone.Collection.extend({
    model: HistogramModel,
    comparator: 'position'
});

/**
 * @param {FiltersPanel} filtersPanel
 * @param {Observable<HistogramChange>} updateAttributeSubject
 * @constructor
 */
function HistogramsPanel (filtersPanel, updateAttributeSubject) {
    this.filtersPanel = filtersPanel;
    // How the model-view communicate back to underlying Rx.
    this.updateAttributeSubject = updateAttributeSubject;
    /** Histogram-specific/owned filter information, keyed/unique per attribute. */
    this.histogramFilters = {};

    const $histogram = $('#histogram');

    this.histograms = new HistogramCollection();
    const panel = this;

    // TODO: Replace this with a proper data transfer through the HTML5
    // drag and drop spec. It seems to be pretty broken outside of firefox,
    // so will not be using today.
    let lastDraggedCid;

    const HistogramView = Backbone.View.extend({
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
            const params = {
                attribute: this.model.get('attribute'),
                type: this.model.get('type'),
                modelId: this.model.cid,
                id: this.cid
            };

            this.template = Handlebars.compile($('#histogramTemplateNoDropdown').html());
            const html = this.template(params);
            this.$el.html(html);
            this.$el.attr('cid', this.cid);
        },

        render: function () {
            // TODO: Wrap updates into render
            const histogram = this.model;

            // TODO: Don't have a 'sparkLines' boolean in the model, but a general vizType field.
            const d3Data = histogram.get('d3Data');
            if (d3Data && ((d3Data.vizType === 'sparkLines') === histogram.get('sparkLines'))) {
                if (histogram.get('sparkLines')) {
                    panel.updateSparkline(histogram.get('vizContainer'), histogram, histogram.get('attribute'));
                } else {
                    panel.updateHistogram(histogram.get('vizContainer'), histogram, histogram.get('attribute'));
                }
                return this;
            }

            const attribute = histogram.get('attribute');
            histogram.set('$el', this.$el); // TODO: Do we ever use this attribute?
            const vizContainer = this.$el.children('.vizContainer');
            histogram.set('vizContainer', vizContainer); // TODO: Do we ever use this attribute?

            let vizHeight = HORIZONTAL_HEIGHT;
            histogram.set('d3Data', {});
            if (histogram.get('sparkLines')) {
                vizContainer.height(String(vizHeight) + 'px');
                initializeSparklineViz(vizContainer, histogram); // TODO: Link to data?
                panel.updateSparkline(vizContainer, histogram, attribute);
            } else {
                const histogramData = histogram.getHistogramData();
                vizHeight = histogramData.numBins * BAR_THICKNESS + histogramMarginsVertical.top + histogramMarginsVertical.bottom;
                vizContainer.height(String(vizHeight) + 'px');
                initializeHistogramViz(vizContainer, histogram); // TODO: Link to data?
                panel.updateHistogram(vizContainer, histogram, attribute);
            }

            $('[data-toggle="tooltip"]', this.$el).tooltip();

            return this;
        },

        encode: function (evt) {
            const target = $(evt.currentTarget);
            const encodingSpec = {
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
            const isEncoded = this.model.get('encodingType') !== undefined;
            const dataframeAttribute = this.model.get('attribute');
            const binning = this.model.getSparkLineData();
            panel.encodeAttribute(dataframeAttribute, encodingSpec, isEncoded, binning).take(1).do((response) => {
                if (response.enabled) {
                    panel.assignEncodingTypeToHistogram(response.encodingType, this.model, response.legend);
                } else {
                    this.model.set('legend', undefined);
                    this.model.set('encodingType', undefined);
                }
            }).subscribe(_.identity, util.makeErrorHandler('Encoding histogram attribute'));
        },

        dragStart: function () {
            lastDraggedCid = this.cid;
        },

        shrink: function (evt) {
            $(evt.target).removeClass('expandedHistogramButton').addClass('expandHistogramButton');
            $(evt.target).removeClass('fa-caret-right').addClass('fa-caret-down');
            const vizContainer = this.model.get('vizContainer');
            const attribute = this.model.get('attribute');
            const d3Data = this.model.get('d3Data');
            const vizHeight = HORIZONTAL_HEIGHT;
            d3Data.svg.selectAll('*').remove();
            vizContainer.empty();
            vizContainer.height(String(vizHeight) + 'px');
            this.model.set('sparkLines', true);
            panel.updateAttribute(attribute, attribute, 'sparkLines');
        },

        expand: function (evt) {
            $(evt.target).removeClass('expandHistogramButton').addClass('expandedHistogramButton');
            $(evt.target).removeClass('fa-caret-down').addClass('fa-caret-right');
            const vizContainer = this.model.get('vizContainer');
            const attribute = this.model.get('attribute');
            const d3Data = this.model.get('d3Data');
            const histogram = this.model.getHistogramData();
            const numBins = (histogram.type === 'countBy') ?
                Math.min(MAX_VERTICAL_ELEMENTS, histogram.numBins) : histogram.numBins;
            const vizHeight = numBins * BAR_THICKNESS + histogramMarginsVertical.top + histogramMarginsVertical.bottom;
            d3Data.svg.selectAll('*').remove();
            vizContainer.empty();
            vizContainer.height(String(vizHeight) + 'px');
            this.model.set('sparkLines', false);
            panel.updateAttribute(attribute, attribute, 'histogram');
        },

        refresh: function () {
            const attribute = this.model.get('attribute');
            const id = this.model.cid;
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


    const AllHistogramsView = Backbone.View.extend({
        el: $histogram,
        histogramsContainer: $('#histograms'),
        events: {
            'click .addHistogramDropdownField': 'addHistogramFromDropdown'
        },
        initialize: function () {
            this.listenTo(panel.histograms, 'add', this.addHistogram);
            this.listenTo(panel.histograms, 'remove', this.removeHistogram);
            this.listenTo(panel.histograms, 'reset', this.addAll);

            filtersPanel.control.namespaceMetadataObservable().filter(_.identity).subscribe(
                (namespaceMetadata) => {
                    var newNamespaceAttributes = {};
                    _.each(namespaceMetadata, function (columnsByName, type) {
                        _.each(columnsByName, function (column, attributeName) {
                            if (Identifier.isPrivate(attributeName)) { return; }
                            var prefixedAttribute = Identifier.clarifyWithPrefixSegment(attributeName, type);
                            newNamespaceAttributes[prefixedAttribute] = column;
                        });
                    });
                    /** @type {Array.<String>} */
                    const attributes = _.keys(newNamespaceAttributes);
                    // Setup add histogram button.
                    const template = Handlebars.compile($('#addHistogramTemplate').html());
                    const params = { fields: attributes };
                    const html = template(params);
                    $('#addHistogram').html(html);
                }
            );

            // Setup drag drop interactions.
            $histogram.on('dragover', (evt) => {
                evt.preventDefault();
            });
            $histogram.on('drop', (evt) => {
                const srcCid = lastDraggedCid;
                const destCid = $(evt.target).parents('.histogramDiv').attr('cid');
                this.moveHistogram(srcCid, destCid);
            });
        },
        render: function () {
            // Re-render by showing the histograms in correct sorted order.
            this.collection.sort();
            const newDiv = $('<div></div>');
            this.collection.each((child) => {
                newDiv.append(child.view.el);
            });

            $(this.histogramsContainer).empty();
            $(this.histogramsContainer).append(newDiv);
        },
        moveHistogram: function (fromCID, toCID) {
            // const length = this.collection.length;
            let srcIdx,
                dstIdx;
            this.collection.each((hist, i) => {
                if (hist.view.cid === fromCID) { srcIdx = i; }
                if (hist.view.cid === toCID) { dstIdx = i; }
            });

            if (srcIdx === dstIdx) {
                return;
            }

            // TODO: Do this in a clean way that isn't obscure as all hell.
            const min = Math.min(srcIdx, dstIdx);
            const max = Math.max(srcIdx, dstIdx);
            this.collection.each((hist, i) => {
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
            const view = new HistogramView({model: histogram});
            histogram.view = view;
            $(this.histogramsContainer).append(view.el);
            view.render();
        },
        removeHistogram: function (histogram) {
            panel.updateAttribute(histogram.get('attribute'));
        },
        addHistogramFromDropdown: function (evt) {
            const attribute = $(evt.currentTarget).text().trim();
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

HistogramsPanel.prototype.updateAttribute = function (delAttr, newAttr, histogramOrientation) {
    this.updateAttributeSubject.onNext({
        delAttr: delAttr,
        newAttr: newAttr,
        histogramOrientation: histogramOrientation
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
        .filter((command) => command.event === 'encode')
        .do((command) => {
            console.log('adding hist panel', command.attribute);
            this.updateAttribute(null, command.attribute, 'sparkLines');
        })
        .flatMap((command) => {
            //poll until exists on DOM & return
            return Rx.Observable.interval(10).timeInterval()
                .map(() => {
                    return $('.histogramDiv .attributeName')
                        .filter(() => $(this).text() === command.attribute).parents('.histogramDiv');
                })
                .filter(($hist) => $hist.length)
                .take(1)
                .do(($histogramPanel) => {
                    console.log('made, encoding', $histogramPanel);
                    this.encodeAttribute(command.attribute, command.encodingType);
                    const route =  {
                        'size': {
                            'quantitative': '.encode-size',
                            'categorical': '.encode-size'
                        },
                        'color': {
                            'quantitative': '.encode-color-quantitative',
                            'categorical': '.encode-color-categorical'
                        }
                    };
                    const routed = route[command.encodingType][command.variation];
                    const $i = $(routed, $histogramPanel);
                    $i[0].click();
                    console.log('clicked on', $i, routed);
                });
        })
        .subscribe(_.identity, util.makeErrorHandler('HistogramsPanel.setupApiInteractions'));
};


HistogramsPanel.prototype.assignEncodingTypeToHistogram = function (encodingType, model, legend) {
    if (model !== undefined) {
        model.set('legend', legend);
        model.set('encodingType', encodingType);
    }
    this.histograms.each((histogram) => {
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
    const filter = this.findFilterForHistogramFilter(dataframeAttribute);
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
function updateHistogramFilterFromExpression (histFilter, ast) {
    let op;
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
            const containerExpr = ast.right;
            if (containerExpr.type === 'ListExpression') {
                histFilter.equals = _.map(containerExpr.elements,
                    (element) => element.type === 'Literal' ? element.value : undefined);
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
    const histogramFiltersToRemove = {};
    _.each(this.histogramFilters, (histFilter, attribute) => {
        if (!attribute) {
            attribute = histFilter.attribute;
        }
        const matchingFilter = this.findFilterForHistogramFilter(attribute);
        if (matchingFilter === undefined) {
            histogramFiltersToRemove[attribute] = histFilter;
        } else {
            // Update histogram filter from filter:
            const query = matchingFilter.query;
            if (query.ast !== undefined) {
                updateHistogramFilterFromExpression(histFilter, query.ast);
            }
            _.extend(histFilter, _.pick(query, ['start', 'stop', 'equals']));
        }
    });
    _.each(histogramFiltersToRemove, (histFilter, attribute) => {
        delete this.histogramFilters[attribute];
    });
};

HistogramsPanel.prototype.updateFiltersFromHistogramFilters = function () {
    const filtersCollection = this.filtersPanel.collection;
    const filterer = this.filtersPanel.control;
    _.each(this.histogramFilters, (histFilter, attribute) => {
        if (!attribute) {
            attribute = histFilter.attribute;
        }
        let query = {};
        // Should be histFilter.dataType:
        let dataType;
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
            dataType = histFilter.dataType || 'string';
        }
        if (histFilter.ast !== undefined) {
            query.ast = histFilter.ast;
        }
        query.inputString = ExpressionPrinter.print(query);
        const matchingFilter = this.findFilterForHistogramFilter(attribute);
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
    });
};


//////////////////////////////////////////////////////////////////////////////
// Histogram Widget
//////////////////////////////////////////////////////////////////////////////

function toStackedObject(local, total, idx, name, attr, numLocal, numTotal, distribution) {
    let stackedObj;
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
    const globalBins = globalStats.bins || [];
    const stackedBins = [];
    const binValues = globalStats.binValues;
    const dataType = globalStats.dataType;
    let name;
    const localFormat = (value) => contentFormatter.shortFormat(value, dataType);
    if (type === 'countBy') {
        const globalKeys = _.keys(globalBins);
        _.each(_.range(Math.min(globalKeys.length, limit)), (idx) => {
            const key = globalKeys[idx];
            const local = bins[key] || 0;
            const total = globalBins[key];
            let binDescription;
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
            const stackedObj = toStackedObject(local, total, idx, name, attr, numLocal, numTotal, distribution);
            stackedBins.push(stackedObj);
        });

    } else {
        // If empty bin array, make it all 0s.
        if (bins.length === 0) {
            bins = Array.apply(null, new Array(globalBins.length)).map(() => 0);
        }
        const zippedBins = _.zip(bins, globalBins); // [[0,2], [1,4], ... ]
        _.each(zippedBins, (stack, idx) => {
            const local = stack[0] || 0;
            const total = stack[1] || 0;
            if (binValues && binValues[idx]) {
                const binDescription = binValues[idx];
                if (binDescription.isSingular) {
                    name = localFormat(binDescription.representative);
                } else if (binDescription.min !== undefined) {
                    name = localFormat(binDescription.min) + ' : ' + localFormat(binDescription.max);
                }
            } else {
                const start = globalStats.minValue + (globalStats.binWidth * idx);
                const stop = start + globalStats.binWidth;
                name = localFormat(start) + ' : ' + localFormat(stop);
            }
            const stackedObj = toStackedObject(local, total, idx, name, attr, numLocal, numTotal, distribution);
            stackedBins.push(stackedObj);
        });
    }
    return stackedBins;
}


HistogramsPanel.prototype.highlight = function (selection, toggle) {
    _.each(selection[0], (sel) => {
        const data = sel.__data__;
        let colorWithoutHighlight = colorsByType;
        if (this.histogramFilters[data.attr] !== undefined) {
            const firstBin = this.histogramFilters[data.attr].firstBin;
            const lastBin = this.histogramFilters[data.attr].lastBin;
            if (data.binId >= firstBin && data.binId <= lastBin) {
                colorWithoutHighlight = colorsByType;
            } else {
                colorWithoutHighlight = colorsUnselectedByType;
            }
        }

        let colorScale = toggle ? colorsHighlightedByType : colorWithoutHighlight;
        $(sel).css('fill', colorScale[data.type]);
    });
};

HistogramsPanel.prototype.updateHistogram = function ($el, model, attribute) {
    const height = $el.height() - histogramMarginsVertical.top - histogramMarginsVertical.bottom;
    const width = $el.width() - histogramMarginsVertical.left - histogramMarginsVertical.right;
    const data = model.get('data');
    const globalStats = model.getHistogramData(attribute);
    const bins = data.bins || []; // Guard against empty bins.
    const type = (data.type && data.type !== 'nodata') ? data.type : globalStats.type;
    const d3Data = model.get('d3Data');
    const numBins = (type === 'countBy' ? Math.min(MAX_VERTICAL_ELEMENTS, globalStats.numBins) : globalStats.numBins);
    data.numValues = data.numValues || 0;

    const svg = d3Data.svg;
    const xScale = d3Data.xScale;
    const yScale = d3Data.yScale;

    const barPadding = 2;
    const stackedBins = toStackedBins(bins, globalStats, type, attribute, data.numValues, globalStats.numValues,
            DIST, (type === 'countBy' ? MAX_VERTICAL_ELEMENTS : 0));
    const barHeight = (type === 'countBy') ? yScale.rangeBand() : Math.floor(height/numBins) - barPadding;

    //////////////////////////////////////////////////////////////////////////
    // Create Columns
    //////////////////////////////////////////////////////////////////////////

    const columns = selectColumns(svg, stackedBins);
    applyAttrColumns(columns.enter().append('g'))
        .attr('transform', (d, i) => 'translate(0,' + yScale(i) + ')')
        .append('rect')
            .attr('height', barHeight + barPadding)
            .attr('width', width)
            .attr('opacity', Transparent)
            .on('mouseover', this.toggleTooltips.bind(this, true, svg))
            .on('mouseout', this.toggleTooltips.bind(this, false, svg));


    //////////////////////////////////////////////////////////////////////////
    // Create and Update Bars
    //////////////////////////////////////////////////////////////////////////

    const bars = selectBars(columns);

    bars.transition().duration(DRAG_SAMPLE_INTERVAL)
        .attr('data-original-title', (d) => d.val)
        .attr('width', (d) => xScale(d.y0) - xScale(d.y1) + heightDelta(d, xScale))
        .attr('x', (d) => xScale(d.y1) - heightDelta(d, xScale));


    this.applyAttrBars(bars.enter().append('rect'), 'bottom', 'top')
        .attr('class', 'bar-rect')
        .attr('height', barHeight)
        .attr('width', (d) => xScale(d.y0) - xScale(d.y1) + heightDelta(d, xScale))
        .attr('x', (d) => xScale(d.y1) - heightDelta(d, xScale));
};


HistogramsPanel.prototype.updateSparkline = function ($el, model, attribute) {
    const width = $el.width() - histogramMarginsHorizontal.left - histogramMarginsHorizontal.right;
    const height = $el.height() - histogramMarginsHorizontal.top - histogramMarginsHorizontal.bottom;
    const data = model.get('data');
    const id = model.cid;
    const globalStats = model.getSparkLineData();
    const bins = data.bins || []; // Guard against empty bins.
    const type = (data.type && data.type !== 'nodata') ? data.type : globalStats.type;
    const d3Data = model.get('d3Data');
    const numBins = (type === 'countBy' ? Math.min(MAX_HORIZONTAL_ELEMENTS, globalStats.numBins) : globalStats.numBins);
    data.numValues = data.numValues || 0;

    const svg = d3Data.svg;
    const xScale = d3Data.xScale;
    const yScale = d3Data.yScale;

    const barPadding = 1;
    const stackedBins = toStackedBins(bins, globalStats, type, attribute, data.numValues, globalStats.numValues,
            DIST, (type === 'countBy' ? MAX_HORIZONTAL_ELEMENTS : 0));

    // const barWidth = (type === 'countBy') ? xScale.rangeBand() : Math.floor(width/numBins) - barPadding;
    const barWidth = (type === 'countBy') ? xScale.rangeBand() : (width / numBins) - barPadding;

    // TODO: Is there a way to avoid this bind? What is the backbone way to do this?
    const filterRedrawCallback = model.view.render.bind(model.view);


    //////////////////////////////////////////////////////////////////////////
    // Create Tooltip Text Elements
    //////////////////////////////////////////////////////////////////////////

    // TODO: Is there a better/cleaner way to create fixed elements in D3?
    svg.selectAll('.lowerTooltip')
        .data([''])
        .enter().append('text')
        .attr('class', 'lowerTooltip')
        .attr('y', height + histogramMarginsHorizontal.bottom - 4)
        .attr('x', 0)
        .attr('opacity', Transparent)
        .attr('fill', colorsByType.global)
        .attr('font-size', '0.7em');

    const upperTooltip = svg.selectAll('.upperTooltip')
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
        .attr('fill', colorsHighlightedByType.global)
        .text('global, ');

    upperTooltip.selectAll('.localTooltip').data([''])
        .enter().append('tspan')
        .attr('class', 'localTooltip')
        .attr('fill', colorsHighlightedByType.local)
        .text('local');

    //////////////////////////////////////////////////////////////////////////
    // Create Columns
    //////////////////////////////////////////////////////////////////////////

    const histogramFilters = this.histogramFilters;
    const histFilter = histogramFilters[attribute];

    const updateOpacity = (d, i) => {
        if (histFilter && i >= histFilter.firstBin && i <= histFilter.lastBin) {
            return SelectedOpacity;
        } else {
            return FullOpacity;
        }
    };
    const updateCursor = (d, i) => {
        if (histFilter && i >= histFilter.firstBin && i <= histFilter.lastBin && histFilter.completed) {
            return 'pointer';
        } else {
            return 'crosshair';
        }
    };
    const encodingType = model.get('encodingType'),
        encodesColor = encodingType !== undefined && encodingType.search(/Color$/) !== -1;
    const legend = model.get('legend');
    const updateColumnColor = (d, i) => {
        if (histFilter && i >= histFilter.firstBin && i <= histFilter.lastBin) {
            return FilterHistogramBarFillColor;
        } else if (encodesColor && legend && legend[i] !== undefined && legend[i] !== null) {
            return legend[i];
        } else {
            return DefaultHistogramBarFillColor;
        }
    };


    const columns = selectColumns(svg, stackedBins);
    const columnRectangles = svg.selectAll('.column-rect');
    columnRectangles.attr('opacity', updateOpacity)
        .style('cursor', updateCursor)
        .attr('fill', updateColumnColor);

    applyAttrColumns(columns.enter().append('g'))
        .attr('attribute', attribute)
        .attr('binnumber', (d, i) => i)
        .attr('transform', (d, i) => 'translate(' + xScale(i) + ',0)')
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

    const bars = selectBars(columns)
        .style('fill', this.reColor.bind(this));

    bars.transition().duration(DRAG_SAMPLE_INTERVAL)
        .attr('data-original-title', (d) => d.val)
        .attr('height', (d) => yScale(d.y0) - yScale(d.y1) + heightDelta(d, yScale))
        .attr('y', (d) => yScale(d.y1) - heightDelta(d, yScale));


    this.applyAttrBars(bars.enter().append('rect'), 'left', 'right')
        .attr('class', 'bar-rect')
        .attr('width', barWidth)
        .attr('transform', 'translate(0,' + HORIZONTAL_BACKGROUND_HEIGHT + ')')
        .attr('height', (d) => yScale(d.y0) - yScale(d.y1) + heightDelta(d, yScale))
        .attr('y', (d) => yScale(d.y1) - heightDelta(d, yScale));

};

function binInLastFilter(lastHistogramFilter, binNum) {
    return (lastHistogramFilter &&
        (lastHistogramFilter.firstBin <= binNum && lastHistogramFilter.lastBin >= binNum));
}

HistogramsPanel.prototype.handleHistogramDown = function (redrawCallback, id, globalStats) {
    const col = d3.select(d3.event.target.parentNode);
    const $element = $(col[0][0]);
    const $parent = $element.parent();

    const startBin = +($element.attr('binnumber')); // Cast to number from string
    const attr = $element.attr('attribute');
    const numBins = globalStats.sparkLines[attr].numBins;
    const lastHistogramFilter = this.histogramFilters[attr];
    this.updateHistogramFilters(attr, id, globalStats, startBin, startBin);

    const startedInLastFilter = binInLastFilter(lastHistogramFilter, startBin);
    let mouseMoved = false;

    const positionChanges = Rx.Observable.fromEvent($parent, 'mouseover')
        .map((evt) => {
            const $col = $(evt.target).parent();
            const binNum = $col.attr('binnumber');

            let firstBin, lastBin;
            if (startedInLastFilter) {
                // User is dragging an existing window
                let delta = binNum - startBin;
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
                const ends = [+startBin, +binNum];
                firstBin = _.min(ends);
                lastBin = _.max(ends);
            }

            mouseMoved = true;
            this.updateHistogramFilters(attr, id, globalStats, firstBin, lastBin);
            this.updateFiltersFromHistogramFilters();
            redrawCallback();
        }).subscribe(_.identity, util.makeErrorHandler('Histogram Filter Dragging'));

    Rx.Observable.fromEvent($(document.body), 'mouseup')
        .take(1)
        .do(() => {
            positionChanges.dispose();
            if (this.histogramFilters[attr]) {
                this.histogramFilters[attr].completed = true;
            }

            // Click on selection, so undo all filters.
            if (startedInLastFilter && !mouseMoved) {
                this.deleteHistogramFilterByAttribute(attr);
            }

            this.updateFiltersFromHistogramFilters();
            redrawCallback();
        }).subscribe(_.identity, util.makeErrorHandler('Histogram Filter Mouseup'));
};

function selectColumns (svg, stackedBins) {
    return svg.selectAll('.column')
        .data(stackedBins, (d) => d.id);
}

function selectBars (columns) {
    return columns.selectAll('.bar-rect')
        .data(((d) => d), ((d) => d.barNum + d.binId));
}

function applyAttrColumns (columns) {
    return columns.classed('g', true)
        .classed('column', true);
}

HistogramsPanel.prototype.reColor = function (d) {
    if (this.histogramFilters[d.attr] !== undefined) {
        const min = this.histogramFilters[d.attr].firstBin;
        const max = this.histogramFilters[d.attr].lastBin;
        if (d.binId >= min && d.binId <= max) {
            return colorsByType[d.type];
        } else {
            return colorsUnselectedByType[d.type];
        }
    } else {
        return colorsByType[d.type];
    }
};

HistogramsPanel.prototype.applyAttrBars = function (bars, globalPos, localPos) {
    return bars
        .attr('data-container', 'body')
        .attr('data-placement', (d) => {
            if (d.type === 'global') {
                return globalPos;
            } else {
                return localPos;
            }
        })

        .attr('data-html', true)
        .attr('data-template', (d) => {
            const fill = colorsHighlightedByType[d.type];
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
    const col = d3.select(d3.event.target.parentNode);
    const bars = col.selectAll('.bar-rect');

    const data = col[0][0].__data__;

    // _.each(bars[0], (child) => {
    //     if (showTooltip) {
    //         $(child).tooltip('fixTitle');
    //         $(child).tooltip('show');
    //     } else {
    //         $(child).tooltip('hide');
    //     }
    // });

    const local = bars[0][0].__data__.val;
    const global = bars[0][1].__data__.val;

    const tooltipBox = svg.select('.upperTooltip');
    const globalTooltip = tooltipBox.select('.globalTooltip');
    const localTooltip = tooltipBox.select('.localTooltip');
    if (showTooltip) {
        const hasSelection = local > 0;
        globalTooltip.text('TOTAL: ' + String(global) + (hasSelection ? ', ': ''));
        localTooltip.text(hasSelection ? 'SELECTED: ' + String(local) : '');
        tooltipBox.attr('opacity', FullOpacity);
    } else {
        globalTooltip.text('');
        localTooltip.text('');
        tooltipBox.attr('opacity', Transparent);
    }


    const textBox = svg.select('.lowerTooltip');
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
    const minimumHeight = 5;
    const height = xScale(d.y0) - xScale(d.y1);
    if (d.val > 0 && d.y0 === 0 && height < minimumHeight) {
        return minimumHeight - height;
    } else {
        return 0;
    }
}

function initializeHistogramViz($el, model) {
    let width = $el.width();
    let height = $el.height(); // TODO: Get this more naturally.
    const data = model.get('data');
    const id = model.cid;
    const attribute = model.get('attribute');
    const globalStats = model.getHistogramData();
    const bins = data.bins || []; // Guard against empty bins.
    const type = (data.type && data.type !== 'nodata') ? data.type : globalStats.type;
    const d3Data = model.get('d3Data');
    const numBins = (type === 'countBy' ? Math.min(MAX_VERTICAL_ELEMENTS, globalStats.numBins) : globalStats.numBins);
    data.numValues = data.numValues || 0;

    // Transform bins and global bins into stacked format.
    const stackedBins = toStackedBins(bins, globalStats, type, attribute, data.numValues, globalStats.numValues,
        DIST, (type === 'countBy' ? MAX_VERTICAL_ELEMENTS : 0));

    width = width - histogramMarginsVertical.left - histogramMarginsVertical.right;
    height = height - histogramMarginsVertical.top - histogramMarginsVertical.bottom;

    const yScale = setupBinScale(type, height, numBins);
    const xScale = setupAmountScale(width, stackedBins, DIST);

    const numTicks = (type === 'countBy' ? numBins : numBins + 1);
    const fullTitles = [];
    const yAxis = d3.svg.axis()
        .scale(yScale)
        .orient('right')
        .ticks(numTicks)
        .tickFormat((d) => {
            let fullTitle;
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

    const svg = setupSvg($el[0], histogramMarginsVertical, width, height);

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
        .on('mouseover', () => {
            const target = d3.event.target;
            $(target).tooltip('fixTitle');
            $(target).tooltip('show');
        })
        .on('mouseout', () => {
            const target = d3.event.target;
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
    let width = $el.width();
    let height = $el.height();
    const data = model.get('data');
    const attribute = model.get('attribute');
    const globalStats = model.getSparkLineData();
    const bins = data.bins || []; // Guard against empty bins.
    const type = (data.type && data.type !== 'nodata') ? data.type : globalStats.type;
    const d3Data = model.get('d3Data');
    const numBins = (type === 'countBy' ? Math.min(MAX_HORIZONTAL_ELEMENTS, globalStats.numBins) : globalStats.numBins);
    data.numValues = data.numValues || 0;

    // Transform bins and global bins into stacked format.
    const stackedBins = toStackedBins(bins, globalStats, type, attribute, data.numValues, globalStats.numValues,
        DIST, (type === 'countBy' ? MAX_HORIZONTAL_ELEMENTS : 0));

    width = width - histogramMarginsHorizontal.left - histogramMarginsHorizontal.right;
    height = height - histogramMarginsHorizontal.top - histogramMarginsHorizontal.bottom;

    const xScale = setupBinScale(type, width, numBins);
    const yScale = setupAmountScale(height - HORIZONTAL_BACKGROUND_HEIGHT, stackedBins, DIST);
    const svg = setupSvg($el[0], histogramMarginsHorizontal, width, height);

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
    let domainMax = 1.0;
    if (!distribution) {
        domainMax = _.max(stackedBins, (bin) => bin.total).total;
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

function isBinValueRange (binValue) {
    return binValue.min !== undefined && binValue.min !== binValue.max &&
        (binValue.min !== binValue.representative || binValue.max !== binValue.representative);
}

/**
 * Retains histogram-control-specific filter details while allowing coordination with the underlying filter model.
 * @param {String} dataframeAttribute
 * @param {String} id
 * @param globalStats
 * @param {Number} firstBin index of first bin, inclusive
 * @param {Number} lastBin index of last bin, inclusive
 */
HistogramsPanel.prototype.updateHistogramFilters = function (dataframeAttribute, id, globalStats, firstBin, lastBin) {

    const updatedHistogramFilter = {
        firstBin: firstBin,
        lastBin: lastBin
    };

    const stats = globalStats.sparkLines[dataframeAttribute];
    const graphType = stats.graphType;

    const identifier = {type: 'Identifier', name: dataframeAttribute};
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
        const binValues = [];
        const binRanges = [];
        // TODO: Determine if this order is deterministic,
        // and if not, explicitly send over a bin ordering from aggregate.
        const binNames = _.keys(stats.bins);
        const isNumeric = _.isNumber(stats.minValue) && _.isNumber(stats.maxValue);
        let otherIsSelected = false;
        for (let i = firstBin; i <= lastBin; i++) {
            let binName = binNames[i];
            if (binName === '_other') {
                otherIsSelected = true;
                continue;
            }
            const binValue = stats.binValues && stats.binValues[binName];
            if (!binValue) { continue; }
            if (isBinValueRange(binValue)) {
                if (binRanges.length === 0) {
                    binRanges.push({min: binValue.min, max: binValue.max, bins: [i]});
                } else {
                    const lastBinRange = binRanges[binRanges.length - 1];
                    if (lastBinRange.bins[lastBinRange.bins.length - 1] === i - 1) {
                        lastBinRange.bins.push(i);
                        lastBinRange.max = binValue.max;
                    }
                }
            } else {
                if (binValue.representative !== undefined) {
                    binName = binValue.representative;
                }
                binValues.push(isNumeric ? Number(binName) : binName);
            }
        }
        updatedHistogramFilter.equals = binValues;
        const elements = _.map(binValues, (x) => ({type: 'Literal', value: x}));
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
        const rangePredicates = _.map(binRanges, ({min, max}) => ({
            type: 'BetweenPredicate',
            start: {type: 'Literal', value: min},
            stop: {type: 'Literal', value: max},
            value: identifier
        }));
        rangePredicates.forEach((betweenPredicate) => {
            updatedHistogramFilter.ast = updatedHistogramFilter.ast === undefined ? betweenPredicate : {
                type: 'BinaryPredicate',
                operator: 'OR',
                left: betweenPredicate,
                right: updatedHistogramFilter.ast
            };
        });
        if (otherIsSelected) {
            let otherAST = {
                type: 'NotExpression',
                operator: 'NOT',
                value: {
                    type: 'BinaryPredicate',
                    operator: 'IN',
                    left: identifier,
                    right: {
                        type: 'ListExpression',
                        elements: _.map(binNames, (x) => ({type: 'Literal', value: x}))
                    }
                }
            };
            rangePredicates.forEach((betweenPredicate) => {
                otherAST = {
                    type: 'BinaryPredicate',
                    operator: 'AND',
                    left: {
                        type: 'NotExpression',
                        operator: 'NOT',
                        value: betweenPredicate
                    },
                    right: otherAST
                };
            });
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
    if (updatedHistogramFilter.ast !== undefined) {
        this.histogramFilters[dataframeAttribute] = updatedHistogramFilter;
    }

    $('.refreshHistogramButton-' + id).css('visibility', 'visible');
};


HistogramsPanel.MAX_HORIZONTAL_BINS = MAX_HORIZONTAL_BINS;


module.exports = HistogramsPanel;

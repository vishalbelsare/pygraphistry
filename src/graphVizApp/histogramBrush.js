'use strict';

const debug   = require('debug')('graphistry:StreamGL:graphVizApp:histogramBrush');
const $       = window.$;
const Rx      = require('rxjs/Rx.KitchenSink');
import '../rx-jquery-stub';
const _       = require('underscore');

const HistogramsPanel = require('./histogramPanel');
const util    = require('./util.js');
const Command = require('./command.js');
const Identifier = require('./Identifier.js');


//////////////////////////////////////////////////////////////////////////////
// CONSTANTS
//////////////////////////////////////////////////////////////////////////////

const DRAG_SAMPLE_INTERVAL = 200;


//////////////////////////////////////////////////////////////////////////////
// Rx/State
//////////////////////////////////////////////////////////////////////////////

const EmptySelectionMessage = '<p class="bg-danger text-center">Empty Selection.</p>';

function handleFiltersResponse (filtersResponseObservable, poi) {
    filtersResponseObservable
        .do((res) => {
            // Invalidate cache now that a filter has executed and possibly changed indices.
            const $histogramErrors = $('#histogramErrors');
            if (!res.success && res.error === 'empty selection') {
                $histogramErrors.html(EmptySelectionMessage);
                return;
            }

            $histogramErrors.empty();
            poi.emptyCache();
        })
        .subscribe(_.identity, util.makeErrorHandler('Emit Filter'));
}

/** @typedef {Object} GlobalStats
 * @property {Object.<BinningResult>} sparkLines
 * @property {Object.<BinningResult>} histograms
 */

/** @typedef {Object} HistogramSpec
 * @property {String} name - full column name
 * @property {String} histogramOrientation
 */

/**
 * @param socket
 * @param {FiltersPanel} filtersPanel
 * @param {Boolean} doneLoading
 * @constructor
 */
function HistogramBrush (socket, filtersPanel, doneLoading) {
    debug('Initializing histogram brush');

    this.lastSelection = undefined;
    /** @type {Array<HistogramSpec>} */
    this.activeDataframeAttributes = [];
    this.dataframeAttributeChange = new Rx.Subject();
    /** @type ReplaySubject<Boolean> */
    this.histogramsPanelReady = new Rx.ReplaySubject(1);

    /** @type ReplaySubject<GlobalStats> */
    this.globalStats = new Rx.ReplaySubject(1);
    /** @type Subject<HistogramChange> */
    this.updateDataframeAttributeSubject = new Rx.Subject();

    this.binningCommand = new Command('binning column data', 'computeBinningForColumns', socket);

    //////////////////////////////////////////////////////////////////////////
    // Setup Streams
    //////////////////////////////////////////////////////////////////////////

    // Setup update attribute subject that histogram panel can write to
    this.updateDataframeAttributeSubject.withLatestFrom(this.globalStats,
        ({delAttr, newAttr, histogramOrientation}, globalStats) =>
            ({delAttr, newAttr, histogramOrientation, globalStats})
    ).switchMap(({delAttr, newAttr, histogramOrientation, globalStats}) => {
        const result = {delAttr, newAttr, histogramOrientation};
        if (newAttr) {
            return this.requestHistogram(histogramOrientation, newAttr, globalStats).map(() => result);
        } else {
            return Rx.Observable.of(result);
        }
    }).subscribe(_.identity, util.makeErrorHandler('Update Attribute'));

    // Once Loaded, setup initial stream of global statistics.
    doneLoading.do(() => {
        this.initializeGlobalData(filtersPanel);
    }).subscribe(_.identity, util.makeErrorHandler('histogram init done loading wrapper'));
}


HistogramBrush.prototype.initializeGlobalData = function (filtersPanel) {
    // On auto-populate, at most 5 histograms, or however many * 85 + 110 px = window height.
    const maxInitialItems = Math.min(Math.round((window.innerHeight - 110) / 85), 5);
    const globalStream = this.binningAcrossPointsAndEdges({
        all: true,
        maxInitialItems: maxInitialItems
    });
    const globalStreamSparklines = this.binningAcrossPointsAndEdges({
        all: true,
        goalNumberOfBins: HistogramsPanel.MAX_HORIZONTAL_BINS,
        maxInitialItems: maxInitialItems
    });
    Rx.Observable.zip(globalStream, globalStreamSparklines, (histogramsReply, sparkLinesReply) => {
        checkReply(histogramsReply);
        checkReply(sparkLinesReply);
        /** @type {GlobalStats} */
        return {histograms: histogramsReply.data, sparkLines: sparkLinesReply.data};
    }).do((data) => {
        this.histogramsPanel = new HistogramsPanel(filtersPanel, this.updateDataframeAttributeSubject);

        // This is redundant with the server request honoring the same limit, but avoids visual overflow:
        const filteredAttributes = {};
        const firstAttributes = _.first(_.keys(data.sparkLines), maxInitialItems);
        const initialHistogramOrientation = 'sparkLines';
        _.each(firstAttributes, (attribute) => {
            filteredAttributes[attribute] = data[initialHistogramOrientation][attribute];
            filteredAttributes[attribute][initialHistogramOrientation] = true;
            this.handleHistogramChange(null, attribute, initialHistogramOrientation);
        });
        this.updateHistogramData(filteredAttributes, data, true);

        this.histogramsPanelReady.onNext(this.histogramsPanel);
        this.globalStats.onNext(data);
    }).subscribe(_.identity, util.makeErrorHandler('Global stat aggregate call'));
};


HistogramBrush.prototype.setupFiltersInteraction = function(filtersPanel, poi) {
    // Setup filtering:
    handleFiltersResponse(filtersPanel.control.filtersResponsesSubject, poi);
};

HistogramBrush.prototype.setupApiInteraction = function (apiActions) {
    this.histogramsPanelReady
        .do((panel) => { panel.setupApiInteraction(apiActions); })
        .subscribe(_.identity, util.makeErrorHandler('HistogramBrush.setupApiInteraction'));
};


/**
 * Take stream of selections and drags and use them for histograms
 */
HistogramBrush.prototype.setupMarqueeInteraction = function (marquee) {
    marquee.selections.map((val) => ({type: 'selection', sel: val}))
        .merge(marquee.drags.inspectTime(DRAG_SAMPLE_INTERVAL).map(val => ({type: 'drag', sel: val})))
        .merge(this.dataframeAttributeChange.map(() => ({type: 'dataframeAttributeChange', sel: this.lastSelection})))
        .switchMap((selContainer) => this.globalStats.map((globalVal) =>
            ({type: selContainer.type, sel: selContainer.sel, globalStats: globalVal})))
        .switchMap(({sel, globalStats, type}) => {
            const binning = {};
            _.each(this.activeDataframeAttributes, (attr) => {
                binning[attr.name] = globalStats[attr.histogramOrientation][attr.name];
            });
            const attributes = _.map(this.activeDataframeAttributes, (attr) => {
                let normalizedName = attr.name;
                let graphType = globalStats[attr.histogramOrientation][attr.name].graphType;
                const columnName = Identifier.identifierToColumnName(normalizedName);
                if (columnName.type) {
                    graphType = columnName.type;
                    normalizedName = columnName.attribute;
                }
                return {
                    name: normalizedName,
                    type: graphType
                };
            });

            this.lastSelection = sel;
            return this.binningCommand.sendWithObservableResult({
                sel: sel,
                attributes: attributes,
                binning: binning
            }).map((binningResponse) => {
                // HACK to make it not display 'all' selections as brushed sections.
                if (sel && sel.all) {
                    const newData = {};
                    _.each(binningResponse.data, (val, key) => {
                        newData[key] = {type: 'nodata'};
                    });
                    binningResponse.data = newData;
                }
                return {reply: binningResponse, sel, globalStats, type};
            });
        })
        .do(({reply}) => {
            if (!reply) {
                console.error('Unexpected server error on binning');
            } else if (reply && !reply.success) {
                console.error('Server replied with error:', reply.error, reply.stack);
            }
            // TODO: Do we want to treat no replies in some special way?
        })
        .filter(({reply}) => reply && reply.success)
        .do(({reply, globalStats}) => {
            this.updateHistogramData(reply.data, globalStats);
        }).subscribe(_.identity, util.makeErrorHandler('Brush selection binning update error'));
};

/** @typedef {Object} HistogramChange
 * @property {String} delAttr - deleted column name
 * @property {String} newAttr - added column name
 * @property {String} histogramOrientation
 */

HistogramBrush.prototype.handleHistogramChange = function (
    oldAttributeName, newAttributeName, histogramOrientation) {
    // Delete old if it exists
    const indexOfOld = _.findIndex(this.activeDataframeAttributes, (x) => x.name === oldAttributeName);
    if (indexOfOld > -1) {
        this.activeDataframeAttributes.splice(indexOfOld, 1);
    }

    // Add new one if it exists
    if (newAttributeName) {
        this.activeDataframeAttributes.push({name: newAttributeName, histogramOrientation: histogramOrientation});
    }

    // Only resend selections if an add/update
    if (newAttributeName) {
        this.dataframeAttributeChange.onNext(newAttributeName);
    }
};


function checkReply (reply) {
    if (reply) {
        if (!reply.success) {
            console.error('Server replied with error from global binning:', reply.error, reply.stack);
        }
    } else {
        console.error('Unexpected server error on global binning');
    }
}

HistogramBrush.prototype.requestHistogram = function (histogramOrientation, attributeName, globalStats) {
    const {type, attribute} = Identifier.identifierToColumnName(attributeName);
    return this.binningCommand.sendWithObservableResult({
        all: true,
        goalNumberOfBins: histogramOrientation === 'sparkLines' ? HistogramsPanel.MAX_HORIZONTAL_BINS : undefined,
        type: type,
        attributes: [{type: type, name: attribute}]
    }).do((histogramsReply) => {
        checkReply(histogramsReply);
    }).do((histogramsReply) => {
        const extendedOrientation = _.extend(globalStats[histogramOrientation], histogramsReply.data);
        this.globalStats.onNext(_.extend(globalStats, {[histogramOrientation]: extendedOrientation}));
    }).do(() => {
        this.handleHistogramChange(null, attributeName, histogramOrientation);
    });
};

HistogramBrush.prototype.updateHistogramData = function (data, globalStats, empty = false) {
    const histograms = [];
    const Model = this.histogramsPanel.model;
    const collection = this.histogramsPanel.collection;
    let length = collection.length;

    // Update models that exist.
    collection.each((histogram) => {
        const attr = histogram.get('attribute');
        if (data[attr] !== undefined) {
            histogram.set({
                data: empty ? {} : data[attr],
                timeStamp: Date.now()
            });
            delete data[attr];
            histograms.push(histogram);
        }
    });

    _.each(data, (val, key) => {
        const histogram = new Model();
        let attributeName = key;
        if (val.graphType !== undefined) {
            histogram.set('type', val.graphType);
        }
        const params = {
            data: empty ? {} : val,
            globalStats: globalStats,
            timeStamp: Date.now(),
            position: length++
        };

        if (val.sparkLines === undefined) {
            // TODO: Make sure that sparkLines is always passed in, so we don't have
            // to do this check.
            _.each(this.activeDataframeAttributes, (attr) => {
                const isSparkLines = attr.histogramOrientation === 'sparkLines';
                if (attr.name === key) {
                    params.sparkLines = (isSparkLines);
                } else if (attr.name.match(/:/) && attr.name.split(/:/, 2)[1] === key) {
                    params.sparkLines = (isSparkLines);
                    attributeName = Identifier.clarifyWithPrefixSegment(attr.name, attr.graphType);
                    if (attr.graphType) {
                        histogram.set('type', attr.graphType);
                    }
                }
            });
        } else {
            params.sparkLines = val.sparkLines;
        }

        histogram.set(params);
        histogram.id = attributeName;
        histogram.set('attribute', attributeName);
        histograms.push(histogram);

    });

    collection.set(histograms);
};


/**
 * @param {BinningParams} params
 * @returns {Observable}
 */
HistogramBrush.prototype.binningAcrossPointsAndEdges = function (params) {
    return Rx.Observable.zip(
        this.binningCommand.sendWithObservableResult(_.extend({}, params, {type: 'point'})),
        this.binningCommand.sendWithObservableResult(_.extend({}, params, {type: 'edge'})),
        (pointHists, edgeHists) => {

            // Disambiguate column names present on both points and edges:
            const pointHistsData = pointHists.data || {};
            const edgeHistsData = edgeHists.data || {};
            _.each(_.keys(edgeHistsData), (columnName) => {
                if (pointHistsData.hasOwnProperty(columnName)) {
                    const pointColumnName = 'point:' + columnName;
                    pointHistsData[pointColumnName] = pointHistsData[columnName];
                    delete pointHistsData[columnName];
                    const edgeColumnName = 'edge:' + columnName;
                    edgeHistsData[edgeColumnName] = edgeHistsData[columnName];
                    delete edgeHistsData[columnName];
                }
            });
            _.each(pointHistsData, (val) => {
                if (val !== undefined) {
                    val.graphType = 'point';
                }
            });
            _.each(edgeHistsData, (val) => {
                if (val !== undefined) {
                    val.graphType = 'edge';
                }
            });

            return {success: pointHists.success && edgeHists.success,
                    data: _.extend({}, pointHistsData, edgeHistsData)};
        });
};


module.exports = HistogramBrush;

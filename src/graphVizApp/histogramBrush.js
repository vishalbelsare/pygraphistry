'use strict';

const debug   = require('debug')('graphistry:StreamGL:graphVizApp:histogramBrush');
const $       = window.$;
const Rx      = require('rxjs/Rx.KitchenSink');
import '../rx-jquery-stub';
const _       = require('underscore');

const HistogramsPanel = require('./histogramPanel');
const util    = require('./util.js');
const Command = require('./command.js');


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


function HistogramBrush(socket, filtersPanel, doneLoading) {
    debug('Initializing histogram brush');

    this.lastSelection = undefined;
    this.activeDataframeAttributes = [];
    this.dataframeAttributeChange = new Rx.Subject();
    this.histogramsPanelReady = new Rx.ReplaySubject(1);

    // Grab global stats at initialization
    this.globalStats = new Rx.ReplaySubject(1);
    const updateDataframeAttributeSubject = new Rx.Subject();

    this.aggregationCommand = new Command('aggregating data', 'aggregate', socket);

    //////////////////////////////////////////////////////////////////////////
    // Setup Streams
    //////////////////////////////////////////////////////////////////////////

    // Setup update attribute subject that histogram panel can write to
    updateDataframeAttributeSubject.do((data) => {
        this.updateDataframeAttribute(data.oldAttr, data.newAttr, data.type);
    }).subscribe(_.identity, util.makeErrorHandler('Update Attribute'));

    // Once Loaded, setup initial stream of global statistics.
    doneLoading.do(() => {
        this.initializeGlobalData(socket, filtersPanel, updateDataframeAttributeSubject);
    }).subscribe(_.identity, util.makeErrorHandler('histogram init done loading wrapper'));
}


const GraphistryAttributeNames = [
    'degree',
    'community_infomap', 'community_louvain', 'community_spinglass',
    'betweenness', 'centrality', 'closeness', 'pagerank',
    'weight', 'degree_in', 'degree_out', 'indegree', 'outdegree',
    'Source', 'Destination', '__nodeid__', 'id'
];


HistogramBrush.prototype.initializeGlobalData = function(socket, filtersPanel, updateDataframeAttributeSubject) {
    const globalStream = this.aggregatePointsAndEdges({
        all: true});
    const globalStreamSparklines = this.aggregatePointsAndEdges({
        all: true,
        binning: {'_goalNumberOfBins': HistogramsPanel.MAX_HORIZONTAL_BINS}});
    Rx.Observable.zip(globalStream, globalStreamSparklines, (histogramsReply, sparkLinesReply) => {
        checkReply(histogramsReply);
        checkReply(sparkLinesReply);
        return {histograms: histogramsReply.data, sparkLines: sparkLinesReply.data};
    }).do((data) => {
        this.histogramsPanel = new HistogramsPanel(
            data, filtersPanel,
            this.dataframeAttributeChange, updateDataframeAttributeSubject);
        data.histogramPanel = this.histogramsPanel;

        // On auto-populate, at most 5 histograms, or however many * 85 + 110 px = window height.
        const maxInitialItems = Math.min(Math.round((window.innerHeight - 110) / 85), 5);
        const filteredAttributes = {};
        // TODO FIXME server should provide smarter summary metadata and dispatch on that
        const keysWithNonTrivialData = _.filter(_.keys(data.sparkLines), (key => {
            var sparkLine = data.sparkLines[key];
            if (sparkLine.type === 'nodata') { return false; }
            if (sparkLine.binValues !== undefined &&
                sparkLine.binValues.length <= 1 &&
                !sparkLine.binValues.hasOwnProperty('_other')) {
                return false;
            }
            if (sparkLine.bins !== undefined &&
                _.size(sparkLine.bins) <= 1) {
                return false;
            }
            return true;
        }));
        // Prioritize user-provided data ahead of system data.
        // Prioritize user-provided data by how small the _other bin is, since mega-valued domains make poor histograms.
        const sortedKeys = _.sortBy(keysWithNonTrivialData, (key) => {
            const sysIndex = GraphistryAttributeNames.indexOf(key);
            if (sysIndex < 0) {
                const otherSize = Math.log10(data.sparkLines[key].bins._other | 1);
                return sysIndex / otherSize;
            } else {
                return sysIndex;
            }
        });
        const firstKeys = _.first(sortedKeys, maxInitialItems);
        _.each(firstKeys, (key) => {
            filteredAttributes[key] = data.sparkLines[key];
            filteredAttributes[key].sparkLines = true;
            this.updateDataframeAttribute(null, key, 'sparkLines');
        });
        this.updateHistogramData(filteredAttributes, data, true);

        this.histogramsPanelReady.onNext(this.histogramsPanel);

    }).subscribe(this.globalStats, util.makeErrorHandler('Global stat aggregate call'));
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
        .switchMap((data) => {
            const binning = {};
            const attributeNames = _.pluck(this.activeDataframeAttributes, 'name');
            _.each(this.activeDataframeAttributes, (attr) => {
                if (attr.type === 'sparkLines') {
                    binning[attr.name] = data.globalStats.sparkLines[attr.name];
                } else {
                    binning[attr.name] = data.globalStats.histograms[attr.name];
                }
            });
            const attributes = _.map(attributeNames, (name) => {
                let normalizedName = name,
                    graphType = data.globalStats.histograms[name].graphType;
                if (normalizedName.indexOf(':') !== -1) {
                    const nameParts = normalizedName.split(':', 2);
                    normalizedName = nameParts[1];
                    graphType = nameParts[0];
                }
                return {
                    name: normalizedName,
                    type: graphType
                };
            });

            const params = {sel: data.sel, attributes: attributes, binning: binning};
            this.lastSelection = data.sel;
            return this.aggregationCommand.sendWithObservableResult(params)
                .map((agg) => ({reply: agg, sel: data.sel, globalStats: data.globalStats, type: data.type}))
                .map((aggResponse) => {
                    // HACK to make it not display 'all' selections as brushed sections.
                    if (aggResponse.sel && aggResponse.sel.all) {
                        const newData = {};
                        _.each(aggResponse.reply.data, (val, key) => {
                            newData[key] = {type: 'nodata'};
                        });
                        aggResponse.reply.data = newData;
                    }
                    return aggResponse;
                });
        })
        .do((data) => {
            if (!data.reply) {
                console.error('Unexpected server error on aggregate');
            } else if (data.reply && !data.reply.success) {
                console.error('Server replied with error:', data.reply.error, data.reply.stack);
            }
            // TODO: Do we want to treat no replies in some special way?
        })
        .filter((data) => data.reply && data.reply.success)
        .do((data) => {
            this.updateHistogramData(data.reply.data, data.globalStats);
        }).subscribe(_.identity, util.makeErrorHandler('Brush selection aggregate error'));
};


HistogramBrush.prototype.updateDataframeAttribute = function (oldAttributeName, newAttributeName, type) {
    // Delete old if it exists
    const indexOfOld = _.pluck(this.activeDataframeAttributes, 'name').indexOf(oldAttributeName);
    if (indexOfOld > -1) {
        this.activeDataframeAttributes.splice(indexOfOld, 1);
    }

    // Add new one if it exists
    if (newAttributeName) {
        this.activeDataframeAttributes.push({name: newAttributeName, type: type});
    }

    // Only resend selections if an add/update
    if (newAttributeName) {
        this.dataframeAttributeChange.onNext(newAttributeName);
    }
};


function checkReply(reply) {
    if (!reply) {
        console.error('Unexpected server error on global aggregate');
    } else if (reply && !reply.success) {
        console.error('Server replied with error from global aggregate:', reply.error, reply.stack);
    }
}

HistogramBrush.prototype.updateHistogramData = function (data, globalStats, empty) {
    const histograms = [];
    const Model = this.histogramsPanel.model;
    const collection = this.histogramsPanel.collection;
    let length = collection.length;

    // Update models that exist.
    collection.each((histogram) => {
        const attr = histogram.get('attribute');
        if (data[attr] !== undefined) {
            const params = {
                data: empty ? {} : data[attr],
                timeStamp: Date.now()
            };
            histogram.set(params);
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
                if (attr.name === key) {
                    params.sparkLines = (attr.type === 'sparkLines');
                } else if (attr.name.match(/:/) && attr.name.split(/:/, 2)[1] === key) {
                    params.sparkLines = (attr.type === 'sparkLines');
                    if (attr.graphType === undefined) {
                        attributeName = attr.name;
                    } else {
                        attributeName = attr.graphType + ':' + attr.name;
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


// ?? -> Observable ??
HistogramBrush.prototype.aggregatePointsAndEdges = function(params) {
    return Rx.Observable.zip(
        this.aggregationCommand.sendWithObservableResult(_.extend({}, params, {type: 'point'})),
        this.aggregationCommand.sendWithObservableResult(_.extend({}, params, {type: 'edge'})),
        (pointHists, edgeHists) => {

            // Disambiguate column names present on both points and edges:
            const pointHistsData = pointHists.data || {},
                edgeHistsData = edgeHists.data || {};
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

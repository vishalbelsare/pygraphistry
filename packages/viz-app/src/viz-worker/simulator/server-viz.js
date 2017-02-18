// Set jshint to ignore `predef:'io'` in .jshintrc so we can manually define io here
/* global -io */

import Rx from 'rxjs';
// import testColormap2 from '../textures/test-colormap2.rgba';

const Observable  = Rx.Observable;

Rx.Observable.return = function (value) {
    return Rx.Observable.of(value);
};

Rx.Subject.prototype.onNext = Rx.Subject.prototype.next;
Rx.Subject.prototype.onError = Rx.Subject.prototype.error;
Rx.Subject.prototype.onCompleted = Rx.Subject.prototype.complete;
Rx.Subject.prototype.dispose = Rx.Subscriber.prototype.unsubscribe;
Rx.AsyncSubject.prototype.onNext = Rx.AsyncSubject.prototype.next;
Rx.AsyncSubject.prototype.onCompleted = Rx.AsyncSubject.prototype.complete;
Rx.BehaviorSubject.prototype.onNext = Rx.BehaviorSubject.prototype.next;
Rx.ReplaySubject.prototype.onNext = Rx.ReplaySubject.prototype.next;

Rx.Subscriber.prototype.onNext = Rx.Subscriber.prototype.next;
Rx.Subscriber.prototype.onError = Rx.Subscriber.prototype.error;
Rx.Subscriber.prototype.onCompleted = Rx.Subscriber.prototype.complete;
Rx.Subscriber.prototype.dispose = Rx.Subscriber.prototype.unsubscribe;

Rx.Subscription.prototype.dispose = Rx.Subscription.prototype.unsubscribe;

const _           = require('underscore');
const Q           = require('q');
const fs          = require('fs');
const path        = require('path');
const extend      = require('node.extend');
const rConf       = require('viz-shared/models/scene');
const lConf       = require('./layout.config.js');
const cljs        = require('./cl.js');
const loader      = require('./data-loader.js');
const driver      = require('./node-driver.js');
const persist     = require('./persist.js');
const Version     = require('./Version.js');
const workbook    = require('./workbook.js');
const labeler     = require('./labeler.js');
const palettes    = require('./palettes.js');
const dataTypeUtil = require('./dataTypes.js');
const DataframeMask = require('./DataframeMask.js');
const Dataframe   = require('./Dataframe.js');
const Binning     = require('./Binning.js');
const TransactionalIdentifier = require('./TransactionalIdentifier');
const vgwriter    = require('./libs/VGraphWriter.js');
const compress    = require('@graphistry/node-pigz');
const config      = require('@graphistry/config')();
const ExpressionCodeGenerator = require('./expressionCodeGenerator');
const RenderNull  = require('./RenderNull.js');
const NBody = require('./NBody.js');
const ComputedColumnSpec = require('./ComputedColumnSpec.js');

import { applyEncodingOnNBody, resetEncodingOnNBody } from './EncodingManager.js';

const log         = require('@graphistry/common').logger;
const logger      = log.createLogger('graph-viz', 'graph-viz/viz-server.js');
const perf        = require('@graphistry/common').perfStats.createPerfMonitor();

try {
    const memoryWatcher = require('memwatch-next');
    if (memoryWatcher !== undefined) {
        memoryWatcher.on('leak', (info) => {
            logger.warn({'memory_leak': info});
        });
        memoryWatcher.on('stats', (stats) => {
            logger.trace({'memory_stats': stats});
        });
    }
} catch (e) {
    logger.debug({message: 'memwatch unavailable', error: e});
}

/** GLOBALS ****************************************************/


const saveAtEachStep = false;
const defaultSnapshotName = 'snapshot';


/** END GLOBALS ****************************************************/


/** Given an Object with buffers as values, returns the sum size in megabytes of all buffers */
function sizeInMBOfVBOs (VBOs) {
    const vboSizeBytes =
        _.reduce(
            _.pluck(_.values(VBOs.buffers), 'byteLength'),
            ((acc, v) => acc + v), 0);
    return (vboSizeBytes / (1024 * 1024)).toFixed(1);
}

function getDataTypesFromValues (values, type, dataframe, debug = false) {
    const dataTypes = {};
    if (values.length > 0) {
        const columnNames = _.keys(values[0]);
        _.each(columnNames, (columnName) => {
            dataTypes[columnName] = dataframe.getDataType(columnName, type);
        });
        if (debug) {
            _.each(values, (value) => {
                _.each(columnNames, (columnName) => {
                    if (!dataTypeUtil.isCompatible(dataTypes[columnName], value)) {
                        throw new Error('Mismatched data type ' + dataTypes[columnName] +
                            ' to value: ' + value.toString());
                    }
                });
            });
        }
    }
    return dataTypes;
}

function getControls (controlsName) {
    let controls = lConf.controls.default;
    if (controlsName in lConf.controls) {
        controls = lConf.controls[controlsName];
    }
    else {
        logger.warn('Unknown controls "%s", using defaults.', controlsName);
    }

    return controls;
}

VizServer.prototype.resetState = function (dataset, socket) {
    logger.info({socketID: socket.client.id}, 'RESETTING APP STATE');

    // FIXME explicitly destroy last graph if it exists?

    // ----- BUFFERS (multiplexed over clients) ----------
    // Serve most recent compressed binary buffers
    // TODO reuse across users
    this.lastCompressedVBOs = undefined;
    this.lastMetadata = undefined;
    /** @type {Object.<String,Function>} **/
    this.bufferTransferFinisher = undefined;

    this.lastRenderConfig = undefined;

    /** Signal to Explicitly Send New VBOs
     * @type ReplaySubject<GraphManager|Boolean>
     */
    this.updateVboSubject = new Rx.ReplaySubject(1);

    const createGraph = function () {
        // TODO: Figure out correct DI/IoC pattern. Is require() sufficient?
        // Otherwise, can we structure this as a DAG constructed of multicast RX streams?

        const controls = getControls(dataset.metadata.controls);
        const device = dataset.metadata.device;
        const vendor = dataset.metadata.vendor;

        const dataframe = new Dataframe();
        const qNullRenderer = RenderNull.create(null);

        const qCl = qNullRenderer.then(
            (renderer) => cljs.create(renderer, device, vendor)
        ).fail(log.makeQErrorHandler(logger, 'Failure in CLJS creation'));

        const qSimulator = Q.all([qNullRenderer, qCl]).spread((renderer, cl) =>
            controls[0].simulator.create(dataframe, renderer, cl, device, vendor, controls)
        ).fail(log.makeQErrorHandler(logger, 'Cannot create simulator'));

        const nBodyInstance = Q.all([qNullRenderer, qSimulator]).spread((renderer, simulator) =>
            NBody.create(renderer, simulator, dataframe, device, vendor, controls, socket)
        ).fail(log.makeQErrorHandler(logger, 'Failure in NBody Creation'));

        const graph = driver.create(dataset, socket, nBodyInstance);
        return graph;
    };



    // ----- ANIMATION ------------------------------------
    // current animation
    // this.animationStep = driver.create(dataset, socket);
    this.animationStep = createGraph();

    // multicast of current animation's ticks
    this.ticksMulti = this.animationStep.ticks.publish();
    this.ticksMulti.connect();

    /** most recent tick
     * @type {Rx.ReplaySubject}
     */
    this.graph = new Rx.ReplaySubject(1);
    // make available to all clients
    this.ticksMulti.take(1).subscribe(this.graph, log.makeRxErrorHandler(logger, logger, 'ticksMulti failure'));

    logger.trace('RESET APP STATE.');
};


function maskFromPointsByConnectingEdges (pointMask, {dataframe, simulator}) {
    return new DataframeMask(dataframe,
        pointMask,
        pointMask === undefined ? undefined : simulator.connectedEdges(pointMask)
    );
}


export function readSelectionCore ({dataframe, simulator}, type, query, cb) {

    const { sel, page, per_page, sort_by, order, search } = query;

    return simulator
        .selectNodesInRect(sel)
        .then((pointIndexes) => {

            const start = (page - 1) * per_page;
            const end = start + per_page;

            const selectionMask = new DataframeMask(dataframe,
                pointIndexes, pointIndexes === undefined ?
                    undefined : simulator.connectedEdges(pointIndexes)
            );

            const data = sliceSelection(dataframe, type, selectionMask, start, end,
                                        sort_by, order === 'asc', search);
            _.extend(data, {
                page: page
            });

            if (cb) cb(null, data);
            return data;
        }).fail(function (err) {
            console.log('======= fail whale');
            if (cb) cb(err);
            log.makeQErrorHandler(logger, 'readSelectionCore qLastSelectionIndices')(err);
        });
};

/**
 * TODO: Dataframe doesn't currently support sorted/filtered views, so we just clumsily manage it here.
 * This is slow + error prone. We need to extend dataframe to allow us to have views.
 *
 * @param {Dataframe} dataFrame
 * @param {String} type
 * @param {DataframeMask} mask
 * @param {Number} start
 * @param {Number} end
 * @param {String} sortColumnName
 * @param {Boolean} ascending
 * @param {String} searchFilter
 * @returns {{count: *, values: *, dataTypes: *}}
 */
function sliceSelection (dataFrame, type, mask, start, end, sortColumnName, ascending, searchFilter) {

    let values, indexes, dataTypes, _global = false;
    const columnNames = dataFrame.publicColumnNamesByType(type);

    if (searchFilter) {
        searchFilter = searchFilter.toLowerCase();
        const newIndices = [];
        mask.forEachIndexByType(type, (idx) => {
            // TODO: do this column-wise or at least avoid row-consing.
            if (_.any(dataFrame.getRowAt(idx, type, columnNames, _global),
                    (val/* , key */) => String(val).toLowerCase().indexOf(searchFilter) > -1)) {
                newIndices.push(idx);
            }
        });
        mask[type] = newIndices;
    }

    const count = mask.numByType(type);

    if (start >= count) {
        end = Math.min(count, Math.abs(end - start));
        start = 0;
    }

    if (sortColumnName === undefined) {
        indexes = mask.getIndexRangeByType(type, start, end);
    } else {

        // TODO: Speed this up / cache sorting. Actually, put this into dataframe itself.
        // Only using permutation out here because this should be pushed into dataframe.
        const columnValuesToSortBy = dataFrame.getColumnValues(sortColumnName, type, _global);
        const sortedColumnValuesAndIndexes = mask
            .mapIndexesByType(type, (idx, i) => [
                columnValuesToSortBy[idx], idx
            ]).sort((val1, val2) => {
                const a = val1[0];
                const b = val2[0];
                if (typeof a === 'string' && typeof b === 'string') {
                    return (ascending ? a.localeCompare(b) : b.localeCompare(a));
                } else if (isNaN(a) || a < b) {
                    return ascending ? -1 : 1;
                } else if (isNaN(b) || a > b) {
                    return ascending ? 1 : -1;
                } else {
                    return 0;
                }
            })
            .slice(start, end);

        indexes = sortedColumnValuesAndIndexes.map((zippedValue) => zippedValue[1]);
    }

    values = dataFrame.getRows(indexes, type, columnNames, _global);
    dataTypes = getDataTypesFromValues(values, type, dataFrame);

    return { count, values, dataTypes };
}

VizServer.prototype.readSelection = function (type, query, res) {
    const { send } = res;
    query.page = parseInt(query.page);
    query.per_page = parseInt(query.per_page);

    this.graph.take(1).do((graph) => {
        return readSelectionCore(graph, type, query, function (err, data) {
            if (!err) return send(data); //caller handles logging
        });
    }).subscribe(
        _.identity,
        (err) => {
            log.makeRxErrorHandler(logger, 'read_selection handler')(err);
        }
    );
};


VizServer.prototype.tickGraph = function (cb) {
    this.graph.take(1).do((graphContent) => {
        this.updateVboSubject.onNext(graphContent);
    }).subscribe(
        _.identity,
        (err) => {
            failWithMessage(cb, 'aggregate error');
            log.makeRxErrorHandler(logger, 'aggregate handler')(err);
        }
    );
};

// TODO Extract a graph method and manage graph contexts by filter data operation.
VizServer.prototype.filterGraphByMaskList = function (graph, selectionMasks, exclusionMasks, errors, viewConfig, cb) {
    const response = {filters: viewConfig.filters, exclusions: viewConfig.exclusions};

    const dataframe = graph.dataframe;
    const masks = dataframe.composeMasks(selectionMasks, exclusionMasks, viewConfig.limits);
    // Prune out dangling edges.
    const prunedMasks = dataframe.pruneMaskEdges(masks);

    logger.debug('mask lengths: ', prunedMasks.numEdges(), prunedMasks.numPoints());

    const simulator = graph.simulator;
    try {
        let filterPromise = dataframe.applyDataframeMaskToFilterInPlace(prunedMasks, simulator);
        // Prune out orphans if configured that way:
        if (viewConfig.parameters && viewConfig.parameters.pruneOrphans === true) {
            filterPromise = filterPromise.then((updatedBuffers) => {

                const orphanPrunedMasks = dataframe.pruneOrphans(prunedMasks);
                logger.debug('orphan pruned mask lengths: ', orphanPrunedMasks.numEdges(), orphanPrunedMasks.numPoints());

                return dataframe.applyDataframeMaskToFilterInPlace(orphanPrunedMasks, simulator).then((pruneUpdatedBuffers) => {
                    // We check return value to see if we should update buffers on the client.
                    // Because this is a cascade of 2 filters, we need to return whether either of them should update
                    return pruneUpdatedBuffers || updatedBuffers;
                });
            });
        }
        filterPromise
            .then((updatedBuffers) => {
                if (updatedBuffers !== false) {
                    simulator.layoutAlgorithms
                        .map((alg) => {
                            return alg.updateDataframeBuffers(simulator);
                        });
                }
                return updatedBuffers;
            }).then((updatedBuffers) => {
                if (updatedBuffers !== false) {
                    simulator.tickBuffers([
                        'curPoints', 'pointSizes', 'pointColors',
                        'edgeColors', 'logicalEdges', 'springsPos'
                    ]);

                    this.tickGraph(cb);
                }
                const sets = vizSetsToPresentFromViewConfig(viewConfig, graph.dataframe);
                _.extend(response, {success: true, sets: sets, errors: errors});
                _.each(errors, logger.debug.bind(logger));
                cb(response);
            }).done(_.identity, (err) => {
                log.makeQErrorHandler(logger, 'dataframe filter')(err);
                errors.push(err);
                _.each(errors, logger.debug.bind(logger));
                _.extend(response, {success: false, errors: errors});
                cb(response);
            });
    } catch (err) {
        log.makeQErrorHandler(logger, 'dataframe filter')(err);
        errors.push(err);
        _.each(errors, logger.debug.bind(logger));
        _.extend(response, {success: false, errors: errors});
        return cb(response);
    }
};

function getNamespaceFromGraph (graph) {
    const dataframeColumnsByType = graph.dataframe.getColumnsByType(true);
    // TODO add special names that can be used in calculation references.
    // TODO handle multiple sources.
    const metadata = _.extend({}, dataframeColumnsByType);
    return metadata;
}


/** @typedef {Object} BinningParams
 * @property {Boolean} all
 * @property {GraphComponentTypes} type
 * @property {Number} goalNumberOfBins
 * @property {Array<String>} attributes
 */


function processBinningOfColumns ({type, attributes, binning, mode, goalNumberOfBins, maxInitialItems},
    graph, pointMask) {
    logger.debug('Starting binning');
    try {
        const mask = maskFromPointsByConnectingEdges(pointMask, graph);
        // TODO persist the binning util somewhere so it can hold more state/cache.
        const binningUtil = new Binning(graph.dataframe);

        if (attributes === undefined) {
            attributes = _.map(binningUtil.selectInitialColumnsForBinning(maxInitialItems),
                (columnName) => ({name: columnName.attribute, type: columnName.type}));
        }

        const namesFromAttributes = (someType) => _.chain(attributes)
            .where({type: someType})
            .pluck('name')
            .value();

        let selectedTypes;
        let selectedAttributes;

        if (type) {
            selectedTypes = [type];
            selectedAttributes = [namesFromAttributes(type)];
        } else {
            selectedTypes = ['point', 'edge'];
            selectedAttributes = _.map(selectedTypes, namesFromAttributes);
        }

        return Observable
            .from(_.zip(selectedTypes, selectedAttributes))
            .concatMap((typeAndAttributeNames) => {
                const eachType = typeAndAttributeNames[0];
                const attributeNames = typeAndAttributeNames[1];
                return binningUtil.computeBinningByColumnNames(
                    mask, attributeNames,
                    binning, mode, eachType, goalNumberOfBins
                );
            })
            .reduce((memo, item) => _.extend(memo, item), {});
    } catch (err) {
        return Observable.throw(err);
    }
}

/**
 * @param {Object} viewConfig
 * @param {Dataframe} dataframe
 * @returns {Object[]}
 */
function vizSetsToPresentFromViewConfig (viewConfig, dataframe) {
    const sets = viewConfig.sets;
    _.each(sets, (vizSet) => {
        switch (vizSet.id) {
            case 'dataframe':
                vizSet.masks = dataframe.fullDataframeMask();
                break;
            case 'filtered':
                vizSet.masks = dataframe.lastMasks;
                break;
            case 'selection':
                vizSet.masks = dataframe.lastSelectionMasks;
                break;
        }
    });
    return _.map(sets, (vizSet) => dataframe.presentVizSet(vizSet));
}

const setPropertyWhiteList = ['title', 'description'];

function updateVizSetFromClientSet (matchingSet, updatedVizSet) {
    _.extend(matchingSet, _.pick(updatedVizSet, setPropertyWhiteList));
    matchingSet.masks.fromJSON(updatedVizSet.masks);
}

function failWithMessage (cb, message) {
    cb({success: false, error: message});
}


function VizServer (app, socket, cachedVBOs, loggerMetadata) {
    log.addMetadataField(loggerMetadata);

    const socketLogger = logger.child({
        socketID: socket.client.id
    });

    socketLogger.info('Client connected');
    this.socketLogger = socketLogger;

    this.isActive = true;
    this.defineRoutesInApp(app);
    this.socket = socket;
    this.cachedVBOs = cachedVBOs;
    /** @type {GraphistryURLParams} */
    const query = this.socket.handshake.query;

    /** @type {ReplaySubject<GraphManager>} */
    this.graph = new Rx.ReplaySubject(1);
    this.viewConfig = new Rx.ReplaySubject(1);
    this.workbookDoc = new Rx.ReplaySubject(1);
    this.dataset = new Rx.ReplaySubject(1);
    this.renderConfig = new Rx.ReplaySubject(1);

    if (!query.falcorClient) {

        this.workbookForQuery(query)
            .do(null, log.makeRxErrorHandler(socketLogger, 'Setting up a Workbook'))
            .concat(Observable.never())
            .subscribe(this.workbookDoc);

        this.workbookDoc
            .mergeMap((workbookDoc) => this.setupDataset(workbookDoc, query))
            .do(null, log.makeRxErrorHandler(socketLogger, 'Dataset setup failure'))
            .concat(Observable.never())
            .subscribe(this.dataset);

        this.dataset
            .map((dataset) => {
                const { metadata } = dataset;
                if (!(metadata.scene in rConf.scenes)) {
                    socketLogger.warn('WARNING Unknown scene "%s", using default', metadata.scene);
                    metadata.scene = 'default';
                }
                return rConf.scenes[metadata.scene];
            })
            .concat(Observable.never())
            .subscribe(this.renderConfig);

        this.workbookDoc
            .map((workbookDoc) => this.getViewToLoad(workbookDoc, query))
            .do(null, log.makeRxErrorHandler(socketLogger, 'Getting a View from a Workbook'))
            .concat(Observable.never())
            .subscribe(this.viewConfig);

        this.dataset.subscribe((dataset) => {
            this.resetState(dataset, socket);
        });

    } else {
        this.ticks = new Rx.ReplaySubject(1);
        this.ticksMulti = new Rx.Subject();
        this.updateVboSubject = new Rx.ReplaySubject(1);

        this.ticks.switch().subscribe(this.ticksMulti);
    }

    this.setupColorTexture();

    this.socket.on('get_version', (ignore, cb) => {
        socketLogger.info('get_version');
        cb({success: true, versions: Version.all});
    });

    this.socket.on('get_sharing_config', (ignore, cb) => {
        var decision = config.S3UPLOADS ? true : false;
        socketLogger.info('get_sharing_config', decision);
        cb({success: true, decision: decision});
    });

    this.socket.on('get_view_config', (ignore, cb) => {
        this.viewConfig.take(1).do((viewConfig) => {
            socketLogger.info('Socket on get_view_config');
            socketLogger.trace({viewConfig: viewConfig}, 'viewConfig');
            cb({success: true, viewConfig: viewConfig});
        }).subscribe(_.identity, (err) => {
            log.makeRxErrorHandler(socketLogger, 'Get view config')(err);
            cb({success: false, errors: [err.message]});
        });
    });

    this.socket.on('update_view_config', (newValues, cb) => {
        this.viewConfig.take(1).do((viewConfig) => {
            socketLogger.info({newValues: newValues}, 'Socket on update_view_config');
            socketLogger.trace({viewConfig: viewConfig}, 'viewConfig');
            extend(true, viewConfig, newValues);
            cb({success: true, viewConfig: viewConfig});
        }).subscribe(_.identity, (err) => {
            log.makeRxErrorHandler(socketLogger, 'Update view config')(err);
            return cb({success: false, errors: [err.message]});
        });
    });

    this.socket.on('update_view_parameter', (spec, cb) => {
        this.viewConfig.take(1).do((viewConfig) => {
            socketLogger.info({newParameters: spec}, 'Socket on update_view_parameters');
            viewConfig.parameters[spec.name] = spec.value;
            socketLogger.trace({viewConfig: viewConfig}, 'viewConfig');
            cb({success: true});
        }).subscribe(_.identity, (err) => {
            log.makeRxErrorHandler(socketLogger, 'Update view parameter')(err);
            return cb({success: false, errors: [err.message]});
        });
    });

    this.socket.on('render_config', (ignore, cb) => {
        this.renderConfig.take(1).subscribe(
            (renderConfig) => {
                socketLogger.info('Socket on render_config (sending render_config to client)');
                socketLogger.trace({renderConfig : renderConfig}, 'renderConfig');

                if (saveAtEachStep) {
                    persist.saveConfig(defaultSnapshotName, renderConfig);
                }

                this.lastRenderConfig = renderConfig;
                return cb({success: true, renderConfig: renderConfig});
            },
            (err) => {
                failWithMessage(cb, 'Render config read error');
                log.makeQErrorHandler(socketLogger, 'sending render_config')(err);
            }
        );
    });

    this.socket.on('update_render_config', (newValues, cb) => {
        this.renderConfig.take(1).subscribe(
            (renderConfig) => {
                socketLogger.info('Socket on update_render_config (Updating render-config from client values)');
                socketLogger.trace({renderConfig: renderConfig}, 'renderConfig [before]');

                extend(true, renderConfig, newValues);

                if (saveAtEachStep) {
                    persist.saveConfig(defaultSnapshotName, renderConfig);
                }

                this.lastRenderConfig = renderConfig;

                cb({success: true, renderConfig: renderConfig});
            },
            (err) => {
                failWithMessage(cb, 'Render config update error');
                log.makeQErrorHandler(socketLogger, 'updating render_config')(err);
            }
        );
    });

    /**
     * @typedef {Object} Point2D
     * @property {Number} x
     * @property {Number} y
     */

    /**
     * @typedef {Object} Rect
     * @property {Point2D} tl top left corner
     * @property {Point2D} br bottom right corner
     */

    /**
     * @typedef {Object} Circle
     * @property {Point2D} center
     * @property {Number} radius
     */

    /**
     * @typedef {Object} SetSpecification
     * @property {String} sourceType one of selection,dataframe,filtered
     * @property {Rect} sel rectangle/etc selection gesture.
     * @property {Circle} circle
     */

    this.socket.on('create_set', (sourceType, specification, cb) => {
        /**
         * @type {SetSpecification} specification
         */
        Rx.Observable.combineLatest(this.graph, this.viewConfig, (graph, viewConfig) => {
            let qNodeSelection;
            let pointsOnly = false;
            const dataframe = graph.dataframe;
            const simulator = graph.simulator;
            if (sourceType === 'selection' || sourceType === undefined) {
                const clientMaskSet = specification.masks;
                if (specification.sel !== undefined) {
                    const rect = specification.sel;
                    pointsOnly = true;
                    qNodeSelection = simulator.selectNodesInRect(rect);
                } else if (specification.circle !== undefined) {
                    const circle = specification.circle;
                    pointsOnly = true;
                    qNodeSelection = simulator.selectNodesInCircle(circle);
                } else if (clientMaskSet !== undefined) {
                    // translate client masks to rawdata masks.
                    qNodeSelection = Q(new DataframeMask(dataframe, clientMaskSet.point, clientMaskSet.edge, dataframe.lastMasks));
                } else {
                    throw Error('Selection not specified for creating a Set');
                }
                if (pointsOnly) {
                    qNodeSelection = qNodeSelection.then(
                        (pointMask) => maskFromPointsByConnectingEdges(pointMask, graph));
                }
            } else if (sourceType === 'dataframe') {
                qNodeSelection = Q(dataframe.fullDataframeMask());
            } else if (sourceType === 'filtered') {
                qNodeSelection = Q(dataframe.lastMasks);
            } else {
                throw Error('Unrecognized special type for creating a Set: ' + sourceType);
            }
            qNodeSelection.then((dataframeMask) => {
                const newSet = {
                    id: new TransactionalIdentifier().toString(),
                    sourceType: sourceType,
                    specification: _.omit(specification, setPropertyWhiteList),
                    masks: dataframeMask,
                    sizes: {point: dataframeMask.numPoints(), edge: dataframeMask.numEdges()}
                };
                updateVizSetFromClientSet(newSet, specification);
                viewConfig.sets.push(newSet);
                dataframe.masksForVizSets[newSet.id] = dataframeMask;
                cb({success: true, set: dataframe.presentVizSet(newSet)});
            }).fail(log.makeQErrorHandler(socketLogger, 'pin_selection_as_set'));
        }).take(1).subscribe(_.identity,
            (err) => {
                socketLogger.error(err, 'Error creating set from selection');
                failWithMessage(cb, 'Server error when saving the selection as a Set');
            });
    });

    const specialSetKeys = ['dataframe', 'filtered', 'selection'];

    this.socket.on('get_sets', (cb) => {
        socketLogger.trace('sending current sets to client');
        Rx.Observable.combineLatest(this.graph, this.viewConfig, (graph, viewConfig) => {
            const outputSets = vizSetsToPresentFromViewConfig(viewConfig, graph.dataframe);
            cb({success: true, sets: outputSets});
        }).take(1).subscribe(_.identity,
            (err) => {
                socketLogger.error(err, 'Error retrieving Sets');
                failWithMessage(cb, 'Server error when retrieving all Set definitions');
            });
    });

    /**
     * This handles creates (set given with no id), updates (id and set given), and deletes (id with no set).
     */
    this.socket.on('update_set', (id, updatedVizSet, cb) => {
        Rx.Observable.combineLatest(this.graph, this.viewConfig, (graph, viewConfig) => {
            if (_.contains(specialSetKeys, id)) {
                throw Error('Cannot update the special Sets');
            }
            const matchingSetIndex = _.findIndex(viewConfig.sets, (vizSet) => vizSet.id === id);
            if (matchingSetIndex === -1) {
                // Auto-create:
                if (!updatedVizSet) {
                    updatedVizSet = {};
                }
                // Auto-create an ID:
                if (updatedVizSet.id === undefined) {
                    updatedVizSet.id = (id || new TransactionalIdentifier()).toString();
                }
                viewConfig.sets.push(updatedVizSet);
            } else if (updatedVizSet) {
                if (updatedVizSet.id === undefined) {
                    updatedVizSet.id = id;
                }
                const matchingSet = viewConfig.sets[matchingSetIndex];
                updateVizSetFromClientSet(matchingSet, updatedVizSet);
                updatedVizSet = matchingSet;
            } else { // No set given means to delete by id
                viewConfig.sets.splice(matchingSetIndex, 1);
                graph.dataframe.masksForVizSets[id] = undefined;
            }
            cb({success: true, set: graph.dataframe.presentVizSet(updatedVizSet)});
        }).take(1).subscribe(_.identity,
            (err) => {
                socketLogger.error(err, 'Error sending update_set');
                failWithMessage(cb, 'Server error when updating a Set');
                throw err;
            });
    });

    this.socket.on('get_filters', (cb) => {
        socketLogger.trace('sending current filters and exclusions to client');
        this.viewConfig.take(1).do((viewConfig) => {
            cb({success: true, filters: viewConfig.filters, exclusions: viewConfig.exclusions});
        }).subscribe(
            _.identity, log.makeRxErrorHandler(socketLogger, 'get_filters handler'));
    });

    this.socket.on('getTimeBoundaries', (data, cb) => {
        this.graph.take(1).do((graph) => {
            const values = graph.dataframe.getColumnValues(data.timeAttr, data.timeType);
            let minTime = new Date(values[0]);
            let maxTime = new Date(values[0]);

            _.each(values, (val) => {
                const date = new Date(val);
                if (date < minTime) {
                    minTime = date;
                }
                if (date > maxTime) {
                    maxTime = date;
                }
            });

            const resp = {
                success: true,
                max: maxTime.getTime(),
                min: minTime.getTime()
            };

            cb(resp);

        })
        .subscribe(
            _.identity,
            (err) => {
                log.makeRxErrorHandler(socketLogger, 'timeAggregation handler')(err);
            }
        );
    });

    this.socket.on('timeAggregation', (data, cb) => {
        this.graph.take(1).do((graph) => {
            const dataframe = graph.dataframe;
            const allMasks = [];
            const errors = [];

            _.each(data.filters, (filter) => {

                const filterQuery = filter.query;
                if (!filterQuery.type) {
                    filterQuery.type = filter.type;
                }
                if (!filterQuery.attribute) {
                    filterQuery.attribute = filter.attribute;
                }

                // Signify that the query is based against the filtered dataframe
                filterQuery.basedOnCurrentDataframe = true;

                const masks = dataframe.getMasksForQuery(filterQuery, errors);

                if (masks !== undefined) {
                    // Record the size of the filtered set for UI feedback:
                    filter.maskSizes = masks.maskSize();
                    allMasks.push(masks);
                }
            });

            let combinedMask = allMasks[0];
            if (allMasks.length > 1) {
                for (let i = 1; i < allMasks.length; i++) {
                    combinedMask = combinedMask.intersection(allMasks[i]);
                }
            }


            const binningUtil = new Binning(dataframe);
            const agg = binningUtil.timeBasedHistogram(
                combinedMask, data.timeType, data.timeAttr, data.start, data.stop, data.timeAggregation);
            cb({
                success: true,
                data: agg
            });

        })
        .subscribe(
            _.identity,
            (err) => {
                log.makeRxErrorHandler(socketLogger, 'timeAggregation handler')(err);
            }
        );
    });


    this.socket.on('update_filters', (definition, cb) => {
        logger.trace('updating filters from client values');
        // Maybe direct assignment isn't safe, but it'll do for now.
        this.viewConfig.take(1).do((viewConfig) => {
            let bumpViewConfig = false;

            // Update exclusions:
            if (definition.exclusions !== undefined &&
                !_.isEqual(definition.exclusions, viewConfig.exclusions)) {
                viewConfig.exclusions = definition.exclusions;
                bumpViewConfig = true;
            }
            logger.info({exclusions: viewConfig.exclusions}, 'updated exclusions');

            // Update filters:
            if (definition.filters !== undefined &&
                !_.isEqual(definition.filters, viewConfig.filters)) {
                viewConfig.filters = definition.filters;
                bumpViewConfig = true;
            }
            logger.debug({filters: viewConfig.filters}, 'Updated filters');

            if (viewConfig.limits === undefined) {
                viewConfig.limits = {point: Infinity, edge: Infinity};
            }

            if (bumpViewConfig) { this.viewConfig.onNext(viewConfig); }

            this.graph.take(1).do((graph) => {
                const dataframe = graph.dataframe;
                const selectionMasks = [];
                const errors = [];
                const generator = new ExpressionCodeGenerator('javascript');
                let exclusionQuery;

                /** @type {DataframeMask[]} */
                const exclusionMasks = [];
                _.each(viewConfig.exclusions, (exclusion) => {
                    if (exclusion.enabled === false) {
                        return;
                    }
                    /** @type ClientQuery */
                    exclusionQuery = exclusion.query;
                    if (exclusionQuery === undefined) {
                        return;
                    }
                    if (!exclusionQuery.type) {
                        exclusionQuery.type = exclusion.type;
                    }
                    if (!exclusionQuery.attribute) {
                        exclusionQuery.attribute = exclusion.attribute;
                    }
                    const masks = dataframe.getMasksForQuery(exclusionQuery, errors);
                    if (masks !== undefined) {
                        masks.setExclusive(true);
                        exclusion.maskSizes = masks.maskSize();
                        exclusionMasks.push(masks);
                    }
                });

                _.each(viewConfig.filters, (filter) => {

                    logger.trace({filter: filter}, 'Beginning ast creation for filter');


                    if (filter.enabled === false) {
                        return;
                    }
                    /** @type ClientQuery */
                    const filterQuery = filter.query;
                    if (filterQuery === undefined) {
                        return;
                    }
                    const ast = filterQuery.ast;
                    if (ast !== undefined &&
                        ast.type === 'LimitExpression' &&
                        ast.value !== undefined) {
                        viewConfig.limits.point = generator.evaluateExpressionFree(ast.value);
                        viewConfig.limits.edge = viewConfig.limits.point;
                        return;
                    }
                    if (!filterQuery.type) {
                        filterQuery.type = filter.type;
                    }
                    if (!filterQuery.attribute) {
                        filterQuery.attribute = filter.attribute;
                    }
                    const masks = dataframe.getMasksForQuery(filterQuery, errors);
                    if (masks !== undefined) {
                        // Record the size of the filtered set for UI feedback:
                        filter.maskSizes = masks.maskSize();
                        selectionMasks.push(masks);
                    }
                });

                this.filterGraphByMaskList(graph, selectionMasks, exclusionMasks, errors, viewConfig, cb);
            }).subscribe(
                _.identity,
                (err) => {
                    log.makeRxErrorHandler(logger, 'update_filters handler')(err);
                }
            );
        }).subscribe(_.identity, log.makeRxErrorHandler(logger, 'get_filters handler'));
    });

    this.socket.on('move_nodes', (data, cb) => {
        this.graph.take(1).do((graph) => {

            if (data.marquee) {
                graph.simulator.moveNodes(data.marquee)
                    .then(() => {
                        this.tickGraph(cb);
                    });
            }

        }).subscribe(
            _.identity,
            (err) => {
                log.makeRxErrorHandler(logger, 'move nodes handler')(err);
            }
        );
    });

    this.socket.on('move_nodes_by_ids', (data, cb) => {
        this.graph.take(1).do((graph) => {

            const {ids, diff} = data;

            if (ids && diff) {
                graph.simulator.moveNodesByIds(ids, diff)
                    .then(() => {
                        this.tickGraph(cb);
                        cb();
                    });
            } else {
                cb({success: false});
            }

        }).subscribe(
            _.identity,
            (err) => {
                log.makeRxErrorHandler(logger, 'move nodes by ids handler')(err);
            }
        );
    });

    this.socket.on('layout_controls', (ignore, cb) => {
        logger.info('Sending layout controls to client');

        this.graph.take(1).do((graph) => {
            const controls = graph.simulator.controls;
            logger.info({controls: controls}, 'Got layout controls');
            cb({success: true, controls: lConf.toClient(controls.layoutAlgorithms)});
        })
        .subscribe(null, (err) => {
            logger.error(err, 'Error sending layout_controls');
            failWithMessage(cb, 'Server error when fetching controls');
            throw err;
        });
    });

    this.socket.on('begin_streaming', (ignore, cb) => {
        this.renderConfig.take(1).subscribe(
            (renderConfig) => {
                this.beginStreaming(renderConfig, this.colorTexture);
                if (cb) {
                    return cb({success: true});
                }
            },
            log.makeQErrorHandler(logger, 'begin_streaming')
        );
    });

    this.socket.on('reset_graph', (ignore, cb) => {
        logger.info('reset_graph command');
        this.dataset.take(1).subscribe(
            (dataset) => {
                this.resetState(dataset, this.socket);
                cb();
            },
            log.makeQErrorHandler(logger, 'reset_graph request')
        );
    });

    this.socket.on('inspect_header', (nothing, cb) => {
        logger.info('inspect header');
        this.graph.take(1).do((graph) => {

            // Exclude prepended with __
            // TODO FIXME treat this in a generic way across UI elements
            const dataframe = graph.dataframe;
            const nodeKeys = dataframe.getAttributeKeys('point')
                .filter((key) => !dataframe.isAttributeNamePrivate(key));
            const edgeKeys = dataframe.getAttributeKeys('edge')
                .filter((key) => !dataframe.isAttributeNamePrivate(key));


            cb({
                success: true,
                header: {
                    nodes: nodeKeys,
                    edges: edgeKeys
                },
                urns: {
                    nodes: 'read_node_selection',
                    edges: 'read_edge_selection'
                }
            });
        }).subscribe(
            _.identity,
            (err) => {
                failWithMessage(cb, 'inspect_header error');
                log.makeRxErrorHandler(logger, 'inspect_header handler')(err);
            }
        );
    });

    /** Implements/gets a namespace comprehension, for calculation references and metadata. */
    this.socket.on('get_namespace_metadata', (cb) => {
        logger.trace('Sending Namespace metadata to client');
        this.graph.take(1).do((graph) => {
            const metadata = getNamespaceFromGraph(graph);
            cb({success: true,
                metadata: metadata});
        }).subscribe(
            _.identity,
            (err) => {
                failWithMessage(cb, 'Namespace metadata error');
                log.makeQErrorHandler(logger, 'sending namespace metadata')(err);
            }
        );
    });

    this.socket.on('update_namespace_metadata', (updates, cb) => {
        logger.trace('Updating Namespace metadata from client');
        this.graph.take(1).subscribe(
            (graph) => {
                const metadata = getNamespaceFromGraph(graph);
                // set success to true when we support update and it succeeds:
                cb({success: false, metadata: metadata});
            },
            (/*err*/) => {
                failWithMessage(cb, 'Namespace metadata update error');
                log.makeQErrorHandler(logger, 'updating namespace metadata');
            }
        );
    });

    // Legacy method for timeslider.js only; refactor that to work with newer code and kill this.
    this.socket.on('filter', (filterSpec, cb) => {
        logger.info({query: filterSpec}, 'Got filter');
        Rx.Observable.combineLatest(this.viewConfig, this.graph, (viewConfig, graph) => {

            const selectionMasks = [];
            const errors = [];

            const dataframe = graph.dataframe;
            _.each(filterSpec, (data, attribute) => {
                let type = data.type;
                const normalization = dataframe.normalizeAttributeName(attribute, type);
                if (normalization === undefined) {
                    errors.push(Error('No attribute found for: ' + attribute + ',' + type));
                    cb({success: false, errors: errors});
                    return;
                } else {
                    type = normalization.type;
                    attribute = normalization.attribute;
                }
                try {
                    const filterFunc = dataframe.filterFuncForQueryObject(data);
                    const masks = dataframe.getAttributeMask(type, attribute, filterFunc);
                    selectionMasks.push(masks);
                } catch (e) {
                    errors.push(e.message);
                }
            });
            this.filterGraphByMaskList(graph, selectionMasks, undefined, errors, viewConfig, cb);
        }).take(1).subscribe(
            _.identity,
            (err) => {
                log.makeRxErrorHandler(logger, 'filter handler')(err);
            }
        );
    });

    this.socket.on('describe_column', (params, cb) => {
        this.graph.take(1).do((graph) => {
            const dataframe = graph.dataframe,
                normalization = dataframe.normalizeAttributeName(params.attribute, params.type);
            const column = dataframe.getColumn(normalization.attribute, normalization.type);
            if (column === undefined) {
                return cb({success: false, errors: ['Column not found']});
            }
            const aggregations = dataframe.getColumnAggregations(normalization.attribute, normalization.type);
            return cb({success: true, description: {
                alias: column.name,
                aggregations: aggregations.getSummary()
            }});
        }).subscribe(
            _.identity,
            (err) => {
                log.makeRxErrorHandler(logger, 'describe column handler')(err);
            }
        );
    });

    this.socket.on('encode_by_column', (encodingRequest, cb) => {
        this.graph.take(1).switchMap((currentGraph) => {

            const { encodingType,
                    type,
                    attribute, variation, binning, timeBounds, reset
                }
                = encodingRequest;

            const encoding = {
                encodingType,
                graphType: type,
                attribute, variation, binning, timeBounds, reset
            };

            const fn = reset ? resetEncodingOnNBody : applyEncodingOnNBody;

            return fn({view: {nBody: currentGraph},
                       encoding})
                .take(1);
        })
        .subscribe(
            (v) => cb({success: true, ...v}),
            (err) => {
                log.makeRxErrorHandler(
                    logger, 'encode by column handler')(err);
                cb({success: false, error: err});
            });
    });

    this.setupBinningRequestHandling();

    this.socket.on('viz', (msg, cb) => { cb({success: true}); });
}

/** Pick the view to load for this query.
 * @param {Object} workbookDoc
 * @param {GraphistryURLParams} query
 * @returns {Object}
 */
VizServer.prototype.getViewToLoad = function (workbookDoc, query) {
    // Pick the default view or the current view or any view.
    const viewConfig = workbookDoc.views.default ||
        (workbookDoc.currentView ?
            workbookDoc.views[workbookDoc.currentview] : _.find(workbookDoc.views));
    // Apply approved URL parameters to that view concretely since we're creating it now:
    _.extend(viewConfig, _.pick(query, workbook.URLParamsThatPersist));
    return viewConfig;
};

/** Get the dataset name from the query parameters, may have been loaded from view:
 * @param {Object} workbookDoc
 * @param {GraphistryURLParams} query
 * @returns {Promise}
 */
VizServer.prototype.setupDataset = function (workbookDoc, query) {
    this.datasetName = query.dataset;
    const queryDatasetURL = loader.datasetURLFromQuery(query),
        queryDatasetConfig = loader.datasetConfigFromQuery(query);
    let datasetURLString, datasetConfig;
    if (queryDatasetURL === undefined) {
        logger.debug('No dataset in URL; picking random in workbook');
        datasetConfig = _.find(workbookDoc.datasetReferences);
        if (datasetConfig === undefined) {
            const msg = 'No dataset reference available to load';
            logger.debug(msg);
            throw new Error(msg);
        } else {
            datasetURLString = datasetConfig.url;
        }
    } else {
        // Using the URL parameter, make a config from the URL:
        datasetURLString = queryDatasetURL.format();
        _.extend(queryDatasetConfig, {
            name: datasetURLString,
            url: datasetURLString
        });
    }
    // Auto-create a config for the URL:
    if (!workbookDoc.datasetReferences.hasOwnProperty(datasetURLString)) {
        workbookDoc.datasetReferences[datasetURLString] = {};
    }
    // Select the config and update it from the query unless the URL mismatches:
    datasetConfig = workbookDoc.datasetReferences[datasetURLString];
    if (datasetConfig.url === undefined ||
        queryDatasetURL === undefined ||
        datasetConfig.url === datasetURLString) {
        _.extend(datasetConfig, queryDatasetConfig);
    }

    // Pass the config on:
    return loader.downloadDataset(datasetConfig);
};

VizServer.prototype.workbookForQuery = function (query) {
    return Observable.create((subscriber) => {

        if (query.workbook) {
            logger.debug({workbook: query.workbook}, 'Loading workbook');

            // TODO report to user if authenticated and can know of this workbook's existence.
            return workbook
                .loadDocument(decodeURIComponent(query.workbook))
                .do(null, log.makeRxErrorHandler(logger, 'Loading Workbook'))
                .subscribe(subscriber);
        } else {
            // Create a new workbook here with a default view:
            subscriber.next(workbook.blankWorkbookTemplate);
            subscriber.complete();
            return subscriber;
        }
    });
};

VizServer.prototype.setupColorTexture = function () {
    this.colorTexture = new Rx.ReplaySubject(1);
    // const imgPath = path.resolve(__dirname, '../test-colormap2.rgba');
    const imgPath = path.resolve('./test-colormap2.rgba');
    // const imgPath = './test-colormap2.rgba';
    Rx.Observable.bindNodeCallback(fs.readFile)(imgPath)
        .flatMap((buffer) => {
            logger.trace('Loaded raw colorTexture', buffer.length);
            return Rx.Observable.bindNodeCallback(compress.deflate)(
                buffer,// binary,
                {output: new Buffer(
                    Math.max(1024, Math.round(buffer.length * 1.5)))})
                .map((compressed) => ({
                    raw: buffer,
                    compressed: compressed
                }));
        })
        .do(() => { logger.trace('Compressed color texture'); })
        .map((pair) => {
            logger.trace('colorMap bytes', pair.raw.length);
            return {
                buffer: pair.compressed[0],
                bytes: pair.raw.length,
                width: 512,
                height: 512
            };
        }).take(1)
        .do((x) => this.colorTexture.next(x))
        .subscribe(_.identity, log.makeRxErrorHandler(logger, 'img/texture'));
    this.colorTexture
        .do(() => { logger.trace('HAS COLOR TEXTURE'); })
        .subscribe(_.identity, log.makeRxErrorHandler(logger, 'colorTexture'));
};

VizServer.prototype.setupBinningRequestHandling = function () {

    const logErrorGlobally = log.makeRxErrorHandler(logger, 'aggregate socket handler');

    // Handle aggregate requests. Using `concatMap` ensures we fully handle one
    // before moving on to the next.
    Observable
        .fromEvent(this.socket, 'computeBinningForColumns', (query, cb) => ({query, cb}))
        .concatMap(({cb, query}) => {
            const resultSelector = processBinningOfColumns.bind(null, query);
            const sendErrorResponse = failWithMessage.bind(null, cb, 'Error while computing binning');

            logger.debug({query: query}, 'Received binning query');

            return this.graph.take(1)
                .flatMap(pointMaskFromQuery, resultSelector)
                .mergeAll()
                .take(1)
                .do(
                    (data) => {
                        logger.info('--- Binning success ---');
                        cb({ success: true, data: data });
                    },
                    (err) => {
                        logErrorGlobally(err);
                        sendErrorResponse(err);
                    }
                )
                .catch(Observable.empty);

            /**
             * @param graph
             * @returns {Observable<Mask>}
             */
            function pointMaskFromQuery (graph) {
                if (query.all === true) {
                    return Observable.of(undefined);
                } else if (!query.sel) {
                    return Observable.of([]);
                } else {
                    return graph.simulator.selectNodesInRect(query.sel);
                }
            }
        })
        .subscribe({});
};

// FIXME: ExpressJS routing does not support re-targeting. So we set a global for now!
let appRouteResponder;

VizServer.prototype.defineRoutesInApp = function (app) {
    this.app = app;

    const routesAlreadyBound = (appRouteResponder !== undefined);
    appRouteResponder = this;
    if (routesAlreadyBound) { return; }

    this.app.get('/vbo', (req, res) => {
        // console.log(req);
        logger.info('HTTP GET request for vbo %s', req.query.buffer);
        // performance monitor here?
        // profiling.debug('VBO request');

        try {
            // TODO: check that query parameters are present, and that given id, buffer exist
            const bufferName = req.query.buffer;
            const id = req.query.id;

            res.set('Content-Encoding', 'gzip');
            const VBOs = (id === appRouteResponder.socket.client.id ?
                appRouteResponder.lastCompressedVBOs : appRouteResponder.cachedVBOs[id]);
            if (VBOs) {
                res.send(VBOs[bufferName]);
            }
            res.send();

            const bufferTransferFinisher = appRouteResponder.bufferTransferFinisher;
            if (bufferTransferFinisher) {
                bufferTransferFinisher(bufferName);
            }
        } catch (e) {
            log.makeQErrorHandler(logger, 'bad /vbo request')(e);
        }
    });

    this.app.get('/texture', (req, res) => {
        logger.info({req: req, res: res}, 'HTTP GET %s', req.originalUrl);
        try {
            appRouteResponder.colorTexture.pluck('buffer').do(
                (data) => {
                    res.set('Content-Encoding', 'gzip');
                    res.send(data);
                })
                .subscribe(_.identity, log.makeRxErrorHandler(logger, 'colorTexture pluck'));

        } catch (e) {
            log.makeQErrorHandler(logger, 'bad /texture request')(e);
        }
    });

    this.app.get('/read_node_selection', (req, res) => {
        logger.info({req: req, res: res}, 'HTTP GET %s', req.originalUrl);

        // HACK because we're sending numbers across a URL string parameter.
        // This should be sent in a type aware manner
        if (req.query.sel.br) {
            const sel = req.query.sel;
            sel.br.x = +sel.br.x;
            sel.br.y = +sel.br.y;
            sel.tl.x = +sel.tl.x;
            sel.tl.y = +sel.tl.y;
        }

        appRouteResponder.readSelection('point', req.query, res);
    });

    this.app.get('/read_edge_selection', (req, res) => {
        logger.info({req: req, res: res}, 'HTTP GET /read_edge_selection');

        // HACK because we're sending numbers across a URL string parameter.
        // This should be sent in a type aware manner
        if (req.query.sel.br) {
            const sel = req.query.sel;
            sel.br.x = +sel.br.x;
            sel.br.y = +sel.br.y;
            sel.tl.x = +sel.tl.x;
            sel.tl.y = +sel.tl.y;
        }

        appRouteResponder.readSelection('edge', req.query, res);
    });

    this.app.get('/export_csv', (req, res) => {
        logger.info({req: req, res: res}, 'HTTP GET /export_csv');
        const type = req.query.type;

        appRouteResponder.graph.take(1).do((graph) => {
            graph.dataframe.formatAsCSV(type)
                .then((formattedCsv) => {
                    const datasetName = appRouteResponder.datasetName || 'graphistry';
                    const filenameSuffix = (type === 'point') ? 'Points' : 'Edges';
                    const filename = datasetName + filenameSuffix + '.csv';
                    res.setHeader('Content-Disposition', 'attachment; filename=' + filename + ';');
                    res.setHeader('Content-Type', 'text/plain');
                    res.charset = 'UTF-8';
                    res.write(formattedCsv);
                    res.send();
                });
        }).subscribe(
            _.identity,
            (err) => {
                log.makeRxErrorHandler(logger, 'export csv handler')(err);
            }
        );
    });
};

VizServer.prototype.rememberVBOs = function (VBOs) {
    this.lastCompressedVBOs = VBOs;
    this.cachedVBOs[this.socket.client.id] = this.lastCompressedVBOs;
};

VizServer.prototype.beginStreaming = function (renderConfig, colorTexture) {

    // ========== BASIC COMMANDS
    this.rememberVBOs({});
    // this.socket.on('disconnect', () => {
    //     this.dispose();
    // });

    // Used for tracking what needs to be sent
    // Starts as all active, and as client caches, whittles down
    const activeBuffers = _.chain(renderConfig.models).pairs().filter((pair) => {
        const model = pair[1];
        return rConf.isBufServerSide(model);
    }).map((pair) => pair[0]).value();

    const activeTextures = _.chain(renderConfig.textures).pairs().filter((pair) => {
        const texture = pair[1];
        return rConf.isTextureServerSide(texture);
    }).map((pair) => pair[0]).value();

    const activePrograms = renderConfig.render;



    let requestedBuffers = activeBuffers,
        requestedTextures = activeTextures;

    // Knowing this helps overlap communication and computations
    this.socket.on('planned_binary_requests', (request) => {
        // console.log(this.socket);
        logger.trace({buffers: request.buffers, textures: request.textures}, 'Client sending planned requests');
        requestedBuffers = request.buffers;
        requestedTextures = request.textures;
    });


    logger.debug({activeBuffers, activeTextures, activePrograms}, 'Beginning stream');

    const graph = this.graph;
    const animationStep = this.animationStep;

    this.socket.on('interaction', (payload) => {
        // performance monitor here?
        // profiling.trace('Got Interaction');
        logger.trace({payload: payload}, 'Received interaction:');
        // TODO: Find a way to avoid flooding main thread waiting for GPU ticks.
        const defaults = {play: false, layout: false};
        animationStep.interact(_.extend(defaults, payload || {}));
    });

    this.socket.on('get_labels', (query, cb) => {

        const indices = query.indices;
        const dim = query.dim;

        graph.take(1)
            .map((currentGraph) => labeler.getLabels(currentGraph.simulator.dataframe, indices, dim))
            .do((out) => {
                cb(null, out);
            })
            .subscribe(
                _.identity,
                (err) => {
                    log.makeRxErrorHandler(logger, 'get_labels')(err);
                    cb('get_labels error');
                });
    });

    this.socket.on('get_global_ids', (sel, cb) => {
        graph.take(1).do((currentGraph) => {
            const res = _.map(sel, (ent) => {
                if (!ent) { return ent; }
                const type = ent.dim === 1 ? 'point' : 'edge';
                return {
                    type: type,
                    dataIdx: currentGraph.simulator.dataframe.globalize(ent.idx, type),
                    viewIdx: ent.idx
                };
            });
            cb({success: true, ids: res});
        }).subscribe(_.identity, log.makeRxErrorHandler(logger, 'get_global_ids'));
    });

    this.socket.on('shortest_path', (pair) => {
        graph.take(1)
            .do((currentGraph) => {
                currentGraph.simulator.highlightShortestPaths(pair);
                animationStep.interact({play: true, layout: false});
            })
            .subscribe(_.identity, log.makeRxErrorHandler(logger, 'shortest_path'));
    });

    this.socket.on('set_colors', (color) => {
        graph.take(1)
            .do((currentGraph) => {
                currentGraph.simulator.setColor(color);
                animationStep.interact({play: true, layout: false});
            })
            .subscribe(_.identity, log.makeRxErrorHandler(logger, 'set_colors'));
    });

    /**
     * @typedef {Object} SelectionSpecification
     * @property {String} action add/remove/replace
     * @property {String} gesture rectangle/circle/masks
     */

    /** This represents a single selection action.
     */
    this.socket.on('select', (specification, cb) => {
        /** @type {SelectionSpecification} specification */
        Rx.Observable.combineLatest(this.graph, this.viewConfig, (currentGraph, viewConfig) => {
            const {simulator} = currentGraph, {dataframe} = simulator;
            let qNodeSelection;
            switch (specification.gesture) {
                case 'clear':
                    qNodeSelection = Q(currentGraph.dataframe.newEmptyMask());
                    break;
                case 'ast': {
                    const errors = [];
                    const query = _.pick(specification, ['ast', 'type', 'attribute']);
                    qNodeSelection = Q(currentGraph.dataframe.getMasksForQuery(query, errors, false));
                    if (errors.length > 0) {
                        throw errors[0];
                    }
                    break;
                }
                case 'rectangle':
                    qNodeSelection = simulator.selectNodesInRect({sel: _.pick(specification, ['tl', 'br'])});
                    break;
                case 'circle':
                    qNodeSelection = simulator.selectNodesInCircle(_.pick(specification, ['center', 'radius']));
                    break;
                case 'masks':
                    // TODO FIXME translate masks to unfiltered indexes.
                    qNodeSelection = Q(specification.masks);
                    break;
                case 'sets': {
                    const matchingSets = _.filter(viewConfig.sets,
                        (vizSet) => specification.setIDs.indexOf(vizSet.id) !== -1);
                    const combinedMasks = _.reduce(matchingSets,
                        (masks, vizSet) => masks.union(vizSet.masks),
                        new DataframeMask(dataframe, [], []));
                    qNodeSelection = Q(combinedMasks);
                    break;
                }
                default:
                    throw Error('Unrecognized selection gesture: ' + specification.gesture.toString());
            }
            if (qNodeSelection === undefined) { throw Error('No selection made'); }
            const lastMasks = dataframe.lastSelectionMasks;
            switch (specification.action) {
                case 'add':
                    qNodeSelection = qNodeSelection.then((dataframeMask) => lastMasks.union(dataframeMask));
                    break;
                case 'remove':
                    qNodeSelection = qNodeSelection.then((dataframeMask) => lastMasks.minus(dataframeMask));
                    break;
                case 'replace':
                    break;
                default:
                    break;
            }
            qNodeSelection.then((dataframeMask) => {
                currentGraph.dataframe.lastSelectionMasks = dataframeMask;
                currentGraph.simulator.tickBuffers(['selectedPointIndexes', 'selectedEdgeIndexes']);
                animationStep.interact({play: true, layout: false});
                cb({success: true});
            });
        }).take(1).subscribe(_.identity,
            (err) => {
                logger.error(err, 'Error modifying the selection');
                failWithMessage(cb, 'Server error when modifying the selection');
            });
    });

    this.socket.on('computeMask', (specification, cb) => {
        /** @type {SelectionSpecification} specification */
        Rx.Observable.combineLatest(this.graph, this.viewConfig, (currentGraph, viewConfig) => {
            let qNodeSelection;
            const dataframe = currentGraph.dataframe;
            specification.basedOnCurrentDataframe = true;
            switch (specification.gesture) {
                case 'ast': {
                    const errors = [];
                    const query = _.pick(specification, ['ast', 'type', 'attribute', 'basedOnCurrentDataframe']);
                    if (!query.type) {
                        const columnName = dataframe.normalizeAttributeName(specification.attribute);
                        _.extend(query, columnName);
                    }
                    qNodeSelection = Q(dataframe.getMasksForQuery(query, errors, false));
                    if (errors.length > 0) {
                        throw errors[0];
                    }
                    break;
                }
                case 'sets': {
                    const matchingSets = _.filter(viewConfig.sets,
                        (vizSet) => specification.setIDs.indexOf(vizSet.id) !== -1);
                    const combinedMasks = _.reduce(_.map(matchingSets, (vizSet) => vizSet.masks),
                        (eachMask, accumulatedMask) => accumulatedMask.union(eachMask));
                    qNodeSelection = Q(combinedMasks);
                    break;
                }
                default:
                    throw Error('Unrecognized highlight gesture: ' + specification.gesture.toString());
            }
            qNodeSelection.then((dataframeMask) => {
                cb({success: true, computedMask: dataframeMask.toJSON()});
            });
        }).take(1).subscribe(_.identity,
            (err) => {
                logger.error(err, 'Error performing a highlight');
                failWithMessage(cb, 'Server error when performing a highlight');
            });
    });

    this.socket.on('highlight_points', (points) => {
        graph.take(1)
            .do((currentGraph) => {
                const {simulator} = currentGraph, {dataframe} = simulator;
                const columnName = 'pointColors';
                points.forEach((point) => {
                    dataframe.getLocalBuffer(columnName)[point.index] = point.color;
                    // currentGraph.simulator.buffersLocal.pointColors[point.index] = point.color;
                });
                simulator.tickBuffers([columnName]);

                animationStep.interact({play: true, layout: false});
            })
            .subscribe(_.identity, log.makeRxErrorHandler(logger, 'highlighted_points'));

    });

    this.socket.on('persist_current_workbook', (workbookName, cb) => {
        Rx.Observable.combineLatest(graph, this.workbookDoc, (currentGraph, workbookDoc) => {
            workbookDoc.title = workbookName;
            workbookDoc.contentName = workbookName;
            workbook.saveDocument(workbookName, workbookDoc).then(
                (result) => cb({success: true, data: result}),
                (rejectedResult) => failWithMessage(cb, rejectedResult));
        }).take(1).subscribe(_.identity, log.makeRxErrorHandler(logger, 'persist_current_workbook'));
    });

    this.socket.on('persist_current_vbo', (contentKey, cb) => {
        graph.take(1)
            .do((currentGraph) => {
                const cleanContentKey = encodeURIComponent(contentKey);
                persist.publishStaticContents(
                    cleanContentKey, this.lastCompressedVBOs,
                    this.lastMetadata, currentGraph.dataframe, renderConfig
                ).then(() => cb({success: true, name: cleanContentKey})
                ).catch((error) => cb({success: false, errors: [error], name: cleanContentKey})
                ).done(
                    _.identity,
                    log.makeQErrorHandler(logger, 'persist_current_vbo')
                );
            })
            .subscribe(_.identity, log.makeRxErrorHandler(logger, 'persist_current_vbo'));
    });

    this.socket.on('persist_upload_png_export', (pngDataURL, contentKey, imageName, cb) => {
        imageName = imageName || 'preview.png';
        graph.take(1)
            .do(() => {
                const cleanContentKey = encodeURIComponent(contentKey),
                    cleanImageName = encodeURIComponent(imageName),
                    base64Data = pngDataURL.replace(/^data:image\/png;base64,/,''),
                    binaryData = new Buffer(base64Data, 'base64');
                persist.publishPNGToStaticContents(cleanContentKey, cleanImageName, binaryData).then(() => {
                    cb({success: true, name: cleanContentKey});
                }).done(
                    _.identity,
                    log.makeQErrorHandler(logger, 'persist_upload_png_export')
                );
            })
            .subscribe(_.identity, log.makeRxErrorHandler(logger, 'persist_upload_png_export'));
    });

    this.socket.on('fork_vgraph', (name, cb) => {
        graph.take(1)
            .do((currentGraph) => {
                const vgName = path.join('Users', name);
                vgwriter.save(currentGraph, vgName).then(() => {
                    cb({success: true, name: vgName});
                }).done(
                    _.identity,
                    log.makeQErrorHandler(logger, 'fork_vgraph')
                );
            })
            .subscribe(_.identity, (err) => {
                failWithMessage(cb, 'fork_vgraph error');
                log.makeRxErrorHandler(logger, 'fork_vgraph error')(err);
            });
    });






    // ============= EVENT LOOP

    // starts true, set to false whenever transfer starts, true again when acknowledged.
    const clientReady = new Rx.ReplaySubject(1);
    clientReady.onNext(true);
    this.socket.on('received_buffers', (time) => {
        perf.gauge('graph-viz:driver:viz-server, client end-to-end time', time);
        logger.trace('Client end-to-end time', time);
        clientReady.onNext(true);
    });
    // const updateVBOCommand = new Command('Update VBOs', 'vbo_update', this.socket);
    const emitOnSocket = Rx.Observable.bindCallback(this.socket.emit.bind(this.socket));

    clientReady.subscribe(logger.debug.bind(logger, 'CLIENT STATUS'), log.makeRxErrorHandler(logger, 'clientReady'));

    const { updateSession } = this;
    if (updateSession) {
        clientReady.debounceTime(200).filter(Boolean).let(updateSession({
            message: null,
            status: 'init',
            progress: 100 * 10/10
        }))
        .subscribe({});
    }

    logger.trace('SETTING UP CLIENT EVENT LOOP ===================================================================');
    let step = 0;
    let lastVersions = null;
    let lastTick = 0;

    const graphObservable = graph;
    graph.expand((currentGraph) => {
        step++;

        logger.trace({activeBuffers: activeBuffers, step:step}, '0. Prefetch VBOs');

        return driver.fetchData(currentGraph, renderConfig, compress,
                                activeBuffers, lastVersions, activePrograms)
            .do((VBOs) => {
                logger.trace({step:step}, '1. pre-fetched VBOs for xhr2: ' + sizeInMBOfVBOs(VBOs.compressed) + 'MB');

                // tell XHR2 sender about it
                if (this.lastCompressedVBOs) {
                    _.extend(this.lastCompressedVBOs, VBOs.compressed);
                } else {
                    this.rememberVBOs(VBOs.compressed);
                }
                this.lastMetadata = {elements: VBOs.elements, bufferByteLengths: VBOs.bufferByteLengths};

                if (saveAtEachStep) {
                    persist.saveVBOs(defaultSnapshotName, VBOs, step);
                }
            })
            .flatMap((VBOs) => {
                logger.trace({step: step}, '2. Waiting for client to finish previous');
                return clientReady
                    .filter(_.identity)
                    .take(1)
                    .do(() => {
                        logger.trace({step: step}, '2b. Client ready, proceed and mark as processing.');
                        clientReady.onNext(false);
                    })
                    .map(_.constant(VBOs));
            })
            .publish((source) => !updateSession ? source : source.merge(source
                .let(updateSession({
                    message: null,
                    status: 'default',
                    progress: 100 * 10/10,
                }))
                .ignoreElements())
            )
            .flatMap((VBOs) => {
                logger.trace('3. tell client about availability');

                // for each buffer transfer
                let clientAckStartTime = Date.now();
                const transferredBuffers = [];
                this.bufferTransferFinisher = function (bufferName) {
                    logger.trace({step: step}, '5a ?. sending a buffer %s', bufferName);
                    transferredBuffers.push(bufferName);
                    // console.log("Length", transferredBuffers.length, requestedBuffers.length);
                    if (transferredBuffers.length === requestedBuffers.length) {
                        const elapsedTime = (Date.now() - clientAckStartTime);
                        logger.trace('5b. started sending all');
                        logger.trace('Socket', '...client asked for all buffers in ' + elapsedTime + 'ms');
                    }
                };

                // const emitFnWrapper = Rx.Observable.fromCallback(socket.emit, socket);

                // notify of buffer/texture metadata
                // FIXME make more generic and account in buffer notification status
                const receivedAll = colorTexture.flatMap((eachColorTexture) => {
                    logger.trace('4a. unwrapped texture meta');

                    const textures = {
                        colorMap: _.pick(eachColorTexture, ['width', 'height', 'bytes'])
                    };

                    // FIXME: should show all active VBOs, not those based on prev req
                    const metadata =
                        _.extend(
                            _.pick(VBOs, ['bufferByteLengths', 'elements']),
                            {
                                textures: textures,
                                versions: {
                                    buffers: VBOs.versions,
                                    textures: {colorMap: 1}
                                },
                                step: step
                            });
                    lastVersions = VBOs.versions;
                    lastTick = VBOs.tick;

                    logger.trace('4b. notifying client of buffer metadata');
                    // performance monitor here?
                    // profiling.trace('===Sending VBO Update===');

                    // const emitter = socket.emit('vbo_update', metadata, (time) => {
                    // return time;
                    // });
                    // const observableCallback = Rx.Observable.bindNodeCallback(emitter);
                    // return observableCallback;
                    // return updateVBOCommand.sendWithObservableResult(metadata);
                    return emitOnSocket('vbo_update', metadata);
                })
                .do((clientElapsed) => {
                    logger.trace('6. client all received');
                    logger.trace('Socket', '...client received all buffers in ' + clientElapsed + 'ms');
                });

                return receivedAll;
            })
            .flatMap(() => {
                logger.trace('7. Wait for next animation step, updateVboSubject, or if we are behind on ticks');

                const filteredUpdateVbo = this.updateVboSubject.filter(_.identity);

                const behindOnTicks = graphObservable.take(1).filter(
                    (latestGraph) => latestGraph.simulator.versions.tick > lastTick);

                return Rx.Observable.merge(this.ticksMulti, filteredUpdateVbo, behindOnTicks)
                    .take(1)
                    .do(() => {
                        // Mark that we don't need to send VBOs independently of ticks anymore.
                        this.updateVboSubject.onNext(false);
                    })
                    .do(() => { logger.trace('8. next ready!'); });
            })
            .map(_.constant(currentGraph));
    })
    .subscribe(
        () => { logger.trace('9. LOOP ITERATED'); },
        log.makeRxErrorHandler(logger, 'Main loop failure'));
};


VizServer.prototype.dispose =
VizServer.prototype.unsubscribe = function () {
    logger.info('disconnecting', this.socket.client.id);
    delete this.updateSession;
    delete this.lastCompressedVBOs;
    delete this.bufferTransferFinisher;
    delete this.cachedVBOs[this.socket.client.id];
    this.isActive = false;
};


VizServer.clHealthCheck = function () {
    try {
        const clContext = cljs.createSync(null);
        if (clContext !== null && clContext !== undefined) {
            return {success: true};
        } else {
            return {success: false, error: 'Null/Undefined CL context'};
        }
    } catch (err) {
        return {success: false, error: err.message};
    }
};

export default VizServer;

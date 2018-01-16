'use strict';

const util = require('util');
const _ = require('underscore');
const Q = require('q');
const fs = require('fs');
const csv = require('csv');
const simpleflake = require('simpleflakes').simpleflake;

const log = require('@graphistry/common').logger;
const logger = log.createLogger('graph-viz', 'graph-viz/js/DataFrame.js');

import ExpressionCodeGenerator from './expressionCodeGenerator';
import ExpressionPlan from './ExpressionPlan.js';
import DataframeMask from './DataframeMask.js';
import ColumnAggregation from './ColumnAggregation.js';
import ComputedColumnManager from './ComputedColumnManager.js';
import EncodingManager from './EncodingManager.js';
import ComputedColumnSpec from './ComputedColumnSpec.js';
import { defaultColumns, defaultEncodingColumns } from './DefaultColumns.js';

import * as palettes from './palettes';
import * as dataTypeUtil from './dataTypes.js';

const baseDirPath = __dirname + '/../assets/dataframe/';

function getUniqueId() {
    const id = simpleflake();
    const stringId = id.toJSON();
    return stringId;
}

/**
 * @type {string[]}
 */
const GraphComponentTypes = ['point', 'edge'];
/**
 * @type {string[]}
 */
const BufferTypeKeys = GraphComponentTypes.concat('simulator');

/**
 * @property {DataframeData} rawdata The original data, immutable by this object.
 * @property {DataframeData} data The potentially-filtered data, starts as a reference to original.
 * @property {Object.<DataframeMask>} masksForVizSets Masks stored by VizSet id.
 * @constructor
 */
function Dataframe() {
    // We keep a copy of the original data, plus a filtered view
    // that defaults to the new raw data.
    //
    // This is to allow tools like filters/selections to propagate to
    // all other tools that rely on data frames.

    /** @type DataframeData */
    this.rawdata = makeEmptyData();
    this.filteredBufferCache = {
        point: {},
        edge: {},
        simulator: {}
    };
    this.typedArrayCache = {};
    this.clBufferCache = {};
    this.lastPointPositions = null;
    /** The last mask applied as a result of in-place filtering. Full by default. */
    this.lastMasks = new DataframeMask(this, undefined, undefined);
    /** The last mask applied as a result of selections. Empty by default. */
    this.lastSelectionMasks = this.newEmptyMask();
    this.lastTaggedSelectionMasks = undefined;
    this.masksForVizSets = {};
    this.bufferAliases = {};
    /** @type DataframeData */
    this.data = this.rawdata;
    this.bufferOverlays = {};
    /** @type {DataframeMetadata} */
    this.metadata = {};

    // TODO: Move this out of data frame constructor.
    this.computedColumnManager = new ComputedColumnManager();
    this.encodingsManager = new EncodingManager();
    this.loadComputedColumns(this.computedColumnManager, this.encodingsManager);
}

Dataframe.prototype.newEmptyMask = function() {
    return new DataframeMask(this, [], []);
};

/**
 * @typedef {Object} DataframeData
 * @property {{point: Object, edge: Object, simulator: Simulator}} attributes
 * @property {{point: Object, edge: Object, simulator: Simulator}} buffers
 * @property {Object} labels
 * @property {Object} hostBuffers
 * @property {Object} localBuffers
 * @property {Object} rendererBuffers
 * @property {{point: Number, edge: Number}} numElements
 */

/**
 * @returns {DataframeData}
 */
function makeEmptyData() {
    return {
        attributes: {
            point: {},
            edge: {},
            simulator: {}
        },
        buffers: {
            point: {},
            edge: {},
            simulator: {}
        },
        labels: {},
        // TODO: Can we deal with this more naturally?
        hostBuffers: {},
        localBuffers: {},
        rendererBuffers: {},
        numElements: {}
    };
}

//////////////////////////////////////////////////////////////////////////////
// Data Filtering
//////////////////////////////////////////////////////////////////////////////

/**
 * Takes in a DataframeMask, and returns a new DataframeMask
 * that is pruned to remove dangling edges. The result's edges
 * must all begin and end in the set of points.
 * @param {DataframeMask} oldMask - The mask to be pruned
 * @returns DataframeMask
 */
Dataframe.prototype.pruneMaskEdges = function(oldMask) {
    // Create hash to lookup which points/edges exist in mask.
    const pointMaskOriginalLookup = {};
    oldMask.forEachPointIndex(idx => {
        pointMaskOriginalLookup[idx] = 1;
    });

    const edgeMask = [];
    const edges = this.rawdata.hostBuffers.unsortedEdges;

    oldMask.forEachEdgeIndex(edgeIdx => {
        const src = edges[2 * edgeIdx];
        const dst = edges[2 * edgeIdx + 1];
        const newSrc = pointMaskOriginalLookup[src];
        const newDst = pointMaskOriginalLookup[dst];
        if (newSrc && newDst) {
            edgeMask.push(edgeIdx);
        }
    });

    return new DataframeMask(this, oldMask.point, edgeMask);
};

/**
 * Takes a mask and excludes points disconnected by it.
 * Uses encapsulateEdges' result of degreesTyped on forwardsEdges and backwardsEdges.
 * @param {DataframeMask} baseMask
 * @returns {DataframeMask}
 */
Dataframe.prototype.pruneOrphans = function(baseMask) {
    const resultPointMask = [];
    if (baseMask.numPoints() === this.numPoints() && baseMask.numEdges() === this.numEdges()) {
        const degreeColumn = this.getColumnValues('degree', 'point');
        baseMask.forEachPointIndex(pointIdx => {
            if (degreeColumn[pointIdx] !== 0) {
                resultPointMask.push(pointIdx);
            }
        });
    } else {
        const degreeOutTyped = this.getHostBuffer('forwardsEdges').degreesTyped,
            degreeInTyped = this.getHostBuffer('backwardsEdges').degreesTyped;
        if (degreeInTyped.length !== baseMask.numPoints()) {
            throw new Error('Mismatched buffer lengths');
        }
        baseMask.forEachPointIndex((pointIdx, idx) => {
            if (degreeInTyped[idx] !== 0 || degreeOutTyped[idx] !== 0) {
                resultPointMask.push(pointIdx);
            }
        });
    }
    return new DataframeMask(this, resultPointMask, baseMask.edge);
};

Dataframe.prototype.numPoints = function numPoints() {
    return this.rawdata.numElements.point;
};

Dataframe.prototype.numEdges = function numEdges() {
    return this.rawdata.numElements.edge;
};

Dataframe.prototype.numByType = function(componentType) {
    return this.rawdata.numElements[componentType];
};

/**
 * @returns DataframeMask
 */
Dataframe.prototype.fullDataframeMask = function() {
    return new DataframeMask(this, undefined, undefined);
};

Dataframe.prototype.presentVizSet = function(vizSet) {
    if (!vizSet || vizSet.masks === undefined) {
        return vizSet;
    }
    const maskResponseLimit = 3e4;
    const masksTooLarge =
        vizSet.masks.numPoints() > maskResponseLimit || vizSet.masks.numEdges() > maskResponseLimit;
    const response = masksTooLarge ? _.omit(vizSet, ['masks']) : _.clone(vizSet);
    response.sizes = { point: vizSet.masks.numPoints(), edge: vizSet.masks.numEdges() };
    // Do NOT serialize the dataframe.
    if (response.masks) {
        response.masks = response.masks.toJSON(this.lastMasks);
    }
    return response;
};

/**
 * This performs mask join operations over the dataset, optimized for having many masks.
 * It allocates two full-sized arrays (bytesize * number of elements) instead of temporary mask objects.
 * There may be other, smarter solutions if we cache strategically, or use a query planner.
 * @param {?DataframeMask[]} selectionMasks
 * @param {?DataframeMask[]} exclusionMasks
 * @param {Object.<Number>} limits
 * @returns ?DataframeMask
 */
Dataframe.prototype.composeMasks = function(selectionMasks, exclusionMasks, limits) {
    if (!limits) {
        limits = { point: Infinity, edge: Infinity };
    }
    _.each(GraphComponentTypes, type => {
        if (limits[type] === undefined) {
            limits[type] = Infinity;
        }
    });

    // No selection masks imply a universal selection:
    if (selectionMasks.length === 0) {
        selectionMasks = [this.fullDataframeMask()];
    }

    // Assumes we will never have more than 255 separate masks.
    const numMasks = selectionMasks.length;
    const MASK_LIMIT = 255;
    if (numMasks > MASK_LIMIT) {
        console.error('TOO MANY MASKS; truncating to: ' + MASK_LIMIT);
        selectionMasks.length = 255;
    }

    // Assumes Uint8Array() constructor initializes to zero, which it should.
    const numMasksSatisfiedByPointID = new Uint8Array(this.numPoints());
    const numMasksSatisfiedByEdgeID = new Uint8Array(this.numEdges());

    // Equivalent to reduce over AND:
    _.each(selectionMasks, mask => {
        mask.forEachEdgeIndex(idx => {
            numMasksSatisfiedByEdgeID[idx]++;
        });

        mask.forEachPointIndex(idx => {
            numMasksSatisfiedByPointID[idx]++;
        });
    });

    // Equivalent to reduce over NOT OR:
    _.each(exclusionMasks, mask => {
        mask.forEachPointIndex(idx => {
            numMasksSatisfiedByPointID[idx] = 0;
        });
        mask.forEachEdgeIndex(idx => {
            numMasksSatisfiedByEdgeID[idx] = 0;
        });
    });

    // The overall masks per type, made by mask intersection:
    const result = new DataframeMask(this, [], []);

    _.each(GraphComponentTypes, type => {
        const limit = limits[type],
            numMasksSatisfiedByID =
                type === 'edge' ? numMasksSatisfiedByEdgeID : numMasksSatisfiedByPointID,
            targetMask = result[type];
        for (let i = 0; i < numMasksSatisfiedByID.length; i++) {
            // Shorthand for "if we've passed all masks":
            if (numMasksSatisfiedByID[i] === numMasks) {
                targetMask.push(i);
            }
            // This is how we implement the limit, just to stop pushing once reached:
            if (targetMask.length >= limit) {
                break;
            }
        }
    });

    return result;
};

/**
 * @typedef {Object} ClientQueryAST
 * @property {String} type - AST node type (from expressionParser.js)
 * @property {Boolean} isLocalized - Whether the AST transformed to run as a single PlanNode.
 */

/**
 * @typedef {Object} ClientQuery
 * @property {String} title User-defined title attribute.
 * @property {String} attribute Dataframe-defined attribute (column) name.
 * @property {String} type 'point' or 'edge'
 * @property {ClientQueryAST} ast - AST returned by expressionParser.js
 * @property {String} inputString - The expression text as entered, not corrected.
 */

/**
 * @param {ClientQuery} query
 * @param {Error[]}errors
 * @returns {DataframeMask}
 */
Dataframe.prototype.getMasksForQuery = function(query, errors, guardNulls = true) {
    const basedOnCurrentDataframe = query.basedOnCurrentDataframe;
    let attribute = query.attribute,
        type = query.type;

    if (attribute) {
        const normalization = this.normalizeAttributeName(attribute, type);
        if (normalization === undefined) {
            errors.push('Unknown frame element');
            return this.fullDataframeMask();
        } else {
            type = normalization.type;
            attribute = normalization.attribute;
        }
    }
    try {
        const plan = new ExpressionPlan(this, query.ast, guardNulls);
        let masks, filterFunc;
        if (query.ast === undefined) {
            filterFunc = this.filterFuncForQueryObject(query, guardNulls);
            masks = this.getAttributeMask(type, attribute, filterFunc, basedOnCurrentDataframe);
        } else if (plan.isRedundant()) {
            type = plan.rootNode.iterationType();
            const normalizedAttribute = this.normalizeAttributeName(
                _.keys(plan.rootNode.identifierNodes())[0],
                type
            );
            if (normalizedAttribute !== undefined) {
                attribute = normalizedAttribute.attribute;
                type = normalizedAttribute.type;
            }
            _.defaults(query, { attribute: attribute, type: type });
            filterFunc = this.filterFuncForQueryObject(query, guardNulls);
            masks = this.getAttributeMask(type, attribute, filterFunc, basedOnCurrentDataframe);
        } else {
            masks = plan.execute();
        }
        if (masks === undefined || _.isArray(masks)) {
            throw new Error('Unable to execute the query');
        } else {
            return masks;
        }
    } catch (e) {
        console.error({ msg: '=== BAD getMasksForQuery', e, query, attribute, type });
        console.error(util.inspect(query, false, null, true));
        errors.push(e.message);
        return this.newEmptyMask();
    }
};

/**
 * @param {ClientQuery} query
 * @param {Boolean?} guardNulls
 * @returns Function<Object>
 */
Dataframe.prototype.filterFuncForQueryObject = function(query, guardNulls = true) {
    let filterFunc = _.identity;
    let ast = query.ast;
    if (ast !== undefined) {
        const generator = new ExpressionCodeGenerator('javascript');
        const columnName = this.normalizeAttributeName(query.attribute, query.type);
        if (columnName === undefined) {
            // Trust that this is still single-attribute. Doubtful idea.
            const plan = new ExpressionPlan(this, ast, guardNulls);
            plan.compile();
            filterFunc = plan.rootNode.executor;
        } else {
            if (guardNulls) {
                ast = generator.transformASTForNullGuards(ast, { value: columnName }, this);
            }
            filterFunc = generator.functionForAST(ast, { '*': 'value' });
        }
    }
    return filterFunc;
};

/**
 * @param {Array} attributeValues
 * @param {Function<Object>} filterFunc
 * @returns Mask
 */
Dataframe.prototype.getMaskForPredicateOnAttributeValues = function(attributeValues, filterFunc) {
    const mask = [];
    if (filterFunc) {
        _.each(attributeValues, (val, idx) => {
            if (filterFunc(val)) {
                mask.push(idx);
            }
        });
    }
    return mask;
};

/**
 * @returns {DataframeMask}
 */
Dataframe.prototype.getAttributeMask = function(
    type,
    columnName,
    filterFunc,
    basedOnCurrentDataframe
) {
    switch (type) {
        case 'point': {
            const pointMask = this.getPointAttributeMask(
                columnName,
                filterFunc,
                basedOnCurrentDataframe
            );
            return new DataframeMask(this, pointMask, undefined);
        }
        case 'edge': {
            const edgeMask = this.getEdgeAttributeMask(
                columnName,
                filterFunc,
                basedOnCurrentDataframe
            );
            return new DataframeMask(this, undefined, edgeMask);
        }
        default:
            throw new Error('Unknown graph component type: ' + type);
    }
};

/**
 * Returns sorted edge mask
 * @param {String} columnName
 * @param {Function<Object>} filterFunc
 * @returns {Mask}
 */
Dataframe.prototype.getEdgeAttributeMask = function(
    columnName,
    filterFunc,
    basedOnCurrentDataframe
) {
    const attr = this.rawdata.attributes.edge[columnName];
    if (attr === undefined) {
        return this.fullDataframeMask();
    }

    const values = basedOnCurrentDataframe ? this.getColumnValues(columnName, 'edge') : attr.values;
    const edgeMask = this.getMaskForPredicateOnAttributeValues(values, filterFunc);
    return edgeMask;
};

/**
 * Returns sorted point mask
 * @param {String} columnName
 * @param {Function<Object>} filterFunc
 * @param {Boolean} basedOnCurrentDataframe
 * @returns {Mask}
 */
Dataframe.prototype.getPointAttributeMask = function(
    columnName,
    filterFunc,
    basedOnCurrentDataframe
) {
    const attr = this.rawdata.attributes.point[columnName];
    if (attr === undefined) {
        return this.fullDataframeMask();
    }

    const values = basedOnCurrentDataframe
        ? this.getColumnValues(columnName, 'point')
        : attr.values;
    return this.getMaskForPredicateOnAttributeValues(values, filterFunc);
};

Dataframe.prototype.initializeTypedArrayCache = function(oldNumPoints, oldNumEdges) {
    this.typedArrayCache.filteredEdges = new Uint32Array(oldNumEdges * 2);
    this.typedArrayCache.unsortedEdgeMask = new Uint32Array(oldNumEdges);
    this.typedArrayCache.edgesFlipped = new Uint32Array(oldNumEdges * 2);

    this.typedArrayCache.newPointSizes = new Uint8Array(oldNumPoints);
    this.typedArrayCache.newPointColors = new Uint32Array(oldNumPoints);
    this.typedArrayCache.newEdgeColors = new Uint32Array(oldNumEdges * 2);
    this.typedArrayCache.newEdgeHeights = new Uint32Array(oldNumEdges * 2);
    const numRenderedSplits = this.rawdata.numElements.renderedSplits;

    this.typedArrayCache.tempDegrees = new Uint32Array(oldNumPoints);
    this.typedArrayCache.tempCurPoints = new Float32Array(oldNumPoints * 2);

    this.typedArrayCache.newDegrees = new Uint32Array(oldNumPoints);
    this.typedArrayCache.newCurPoints = new Float32Array(oldNumPoints * 2);
};

/**
 * Filters this.data in-place given masks. Does not modify this.rawdata.
 * TODO: Take in Set objects, not just Mask.
 * @param {DataframeMask} masks
 * @param {Simulator} simulator
 * @returns {Promise.<Array<Buffer>>} updated arrays - false if no-op
 */
Dataframe.prototype.applyDataframeMaskToFilterInPlace = function(masks, simulator) {
    logger.debug('Starting Filtering Data In-Place by DataframeMask');

    if (masks.equalsMask(this.lastMasks)) {
        return Q(false);
    }

    this.lastTaggedSelectionMasks = undefined;

    const start = Date.now();

    const rawdata = this.rawdata;

    const rawSimBuffers = rawdata.buffers.simulator;

    /** @type {DataframeData} */
    const newData = makeEmptyData();
    const numPoints = masks.numPoints();
    const numEdges = masks.numEdges();
    const oldNumPoints = this.numPoints();
    const oldNumEdges = this.numEdges();

    // TODO: Should this be lazy, or done at startup?
    if (_.keys(this.typedArrayCache).length === 0) {
        this.initializeTypedArrayCache(oldNumPoints, oldNumEdges);
    }

    // TODO: Figure out how GC/memory management works.

    ///////////////////////////////////////////////////////////////////////////
    // Simulator / Graph Specific stuff. TODO: Should this be in the dataframe?
    ///////////////////////////////////////////////////////////////////////////

    // Filter out to new edges/points arrays.
    const filteredEdges = new Uint32Array(
        this.typedArrayCache.filteredEdges.buffer,
        0,
        numEdges * 2
    );
    const originalEdges = rawdata.hostBuffers.unsortedEdges;

    // We start unsorted because we're working with the rawdata first.
    const unsortedEdgeMask = new Uint32Array(
        this.typedArrayCache.unsortedEdgeMask.buffer,
        0,
        numEdges
    );

    masks.forEachEdgeIndex((edgeIndex, i) => {
        unsortedEdgeMask[i] = edgeIndex;
    });

    // TODO: See if there's a way to do this without sorting.
    // Sorting is slow as all hell.
    // Array.prototype.sort.call(unsortedEdgeMask, (a, b) => a - b);

    const unsortedMasks = masks;

    // const unsortedMasks = new DataframeMask(
    //     this,
    //     masks.point,
    //     unsortedEdgeMask
    // );

    const pointOriginalLookup = [];
    masks.forEachPointIndex((pointIndex, i) => {
        pointOriginalLookup[pointIndex] = i;
    });

    _.each(unsortedEdgeMask, (oldIdx, i) => {
        filteredEdges[i * 2] = pointOriginalLookup[originalEdges[oldIdx * 2]];
        filteredEdges[i * 2 + 1] = pointOriginalLookup[originalEdges[oldIdx * 2 + 1]];
    });

    const edgesFlipped = new Uint32Array(
        this.typedArrayCache.edgesFlipped.buffer,
        0,
        filteredEdges.length
    );

    for (let i = 0; i < filteredEdges.length / 2; i++) {
        edgesFlipped[2 * i] = filteredEdges[2 * i + 1];
        edgesFlipped[2 * i + 1] = filteredEdges[2 * i];
    }

    newData.hostBuffers.unsortedEdges = filteredEdges;
    const forwardsEdges = this.encapsulateEdges(
        filteredEdges,
        numPoints,
        rawdata.hostBuffers.forwardsEdges,
        unsortedMasks,
        pointOriginalLookup
    );
    const backwardsEdges = this.encapsulateEdges(
        edgesFlipped,
        numPoints,
        rawdata.hostBuffers.backwardsEdges,
        unsortedMasks,
        pointOriginalLookup
    );
    newData.hostBuffers.forwardsEdges = forwardsEdges;
    newData.hostBuffers.backwardsEdges = backwardsEdges;
    // newData.hostBuffers.points = rawdata.hostBuffers.points;

    // TODO index translation (filter scope)
    newData.localBuffers.selectedEdgeIndexes = this.lastSelectionMasks.typedEdgeIndexes();
    newData.localBuffers.selectedPointIndexes = this.lastSelectionMasks.typedPointIndexes();

    ///////////////////////////////////////////////////////////////////////////
    // Copy non-GPU buffers
    ///////////////////////////////////////////////////////////////////////////

    const numRenderedSplits = rawdata.numElements.renderedSplits;

    // numElements;
    // Copy all old in.
    _.each(_.keys(rawdata.numElements), key => {
        newData.numElements[key] = rawdata.numElements[key];
    });
    // Update point/edge counts, since those were filtered,
    newData.numElements.point = masks.numPoints();
    newData.numElements.edge = masks.numEdges();
    // TODO: NumMidPoints and MidEdges

    ///////////////////////////////////////////////////////////////////////////
    // Copy Buffer Overlays
    ///////////////////////////////////////////////////////////////////////////

    _.each(this.bufferOverlays, (val /*, key*/) => {
        const alias = val.alias;
        const type = val.type;
        const originalName = val.originalName;

        const newBuffer = this.getLocalBuffer(originalName).constructor(masks.maskSize()[type]);
        const rawBuffer = this.rawdata.localBuffers[alias];

        masks.forEachIndexByType(type, (rawIndex, i) => {
            newBuffer[i] = rawBuffer[rawIndex];
        });

        newData.localBuffers[alias] = newBuffer;
    });

    //////////////////////////////////
    // SIMULATOR BUFFERS.
    //////////////////////////////////

    const tempCurPoints = new Float32Array(
        this.typedArrayCache.tempCurPoints.buffer,
        0,
        oldNumPoints * 2
    );

    const newDegrees = new Uint32Array(this.typedArrayCache.newDegrees.buffer, 0, numPoints);
    const newCurPoints = new Float32Array(
        this.typedArrayCache.newCurPoints.buffer,
        0,
        numPoints * 2
    );

    const filteredSimBuffers = this.data.buffers.simulator;

    return Q.all([filteredSimBuffers.curPoints.read(tempCurPoints)])
        .spread(() => {
            ///////////////////////////////////////
            // Update last locations of points
            ///////////////////////////////////////

            let promise;
            // TODO: Move this into general initialization
            if (!this.lastPointPositions) {
                this.lastPointPositions = new Float32Array(oldNumPoints * 2);
                _.each(tempCurPoints, (point, i) => {
                    this.lastPointPositions[i] = point;
                });

                promise = simulator.renderer
                    .createBuffer(this.lastPointPositions, 'curPointsFiltered')
                    .then(pointVBO => {
                        return simulator.cl.createBufferGL(pointVBO, 'curPointsFiltered');
                    })
                    .then(pointBuf => {
                        this.filteredBufferCache.simulator.curPoints = pointBuf;
                    });
            } else {
                this.lastMasks.forEachPointIndex((pointIndex, i) => {
                    this.lastPointPositions[pointIndex * 2] = tempCurPoints[i * 2];
                    this.lastPointPositions[pointIndex * 2 + 1] = tempCurPoints[i * 2 + 1];
                });

                promise = Q({});
            }

            return promise;
        })
        .then(() => {
            masks.forEachPointIndex((oldPointIndex, i) => {
                newDegrees[i] = forwardsEdges.degreesTyped[i] + backwardsEdges.degreesTyped[i];

                newCurPoints[i * 2] = this.lastPointPositions[oldPointIndex * 2];
                newCurPoints[i * 2 + 1] = this.lastPointPositions[oldPointIndex * 2 + 1];
            });

            const someBufferPropertyNames = [
                'curPoints',
                'degrees',
                'forwardsEdges',
                'forwardsEdgeStartEndIdxs',
                'backwardsEdges',
                'backwardsEdgeStartEndIdxs'
            ];
            _.each(someBufferPropertyNames, key => {
                newData.buffers.simulator[key] = this.filteredBufferCache.simulator[key];
            });

            const newBuffers = newData.buffers.simulator;
            return Q.all([
                newBuffers.curPoints.write(newCurPoints),
                newBuffers.degrees.write(newDegrees),
                newBuffers.forwardsEdges.write(forwardsEdges.edgesTyped),
                newBuffers.forwardsEdgeStartEndIdxs.write(forwardsEdges.edgeStartEndIdxsTyped),
                newBuffers.backwardsEdges.write(backwardsEdges.edgesTyped),
                newBuffers.backwardsEdgeStartEndIdxs.write(backwardsEdges.edgeStartEndIdxsTyped)
            ]);
        })
        .then(() => {
            // Delete all GPU buffers for values.
            const promises = [];
            _.each(GraphComponentTypes, type => {
                const buffers = this.data.buffers[type];
                _.each(_.keys(buffers), name => {
                    //const buf = buffers[name];
                    promises.push(buffers.delete);
                    delete buffers[name];
                });
            });

            return Q.all(promises);
        })
        .then(() => {
            // Just in case, copy over references from raw data to newData
            // This means we don't have to explicitly overwrite everything.

            _.each(_.keys(rawdata.buffers.simulator), key => {
                if (newData.buffers.simulator[key] === undefined) {
                    newData.buffers.simulator[key] = rawdata.buffers.simulator[key];
                }
            });

            _.each(_.keys(rawdata.localBuffers), key => {
                if (newData.localBuffers[key] === undefined) {
                    newData.localBuffers[key] = rawdata.localBuffers[key];
                }
            });

            _.each(_.keys(rawdata.numElements), key => {
                if (newData.numElements[key] === undefined) {
                    newData.numElements[key] = rawdata.numElements[key];
                }
            });

            _.each(_.keys(rawdata.rendererBuffers), key => {
                if (newData.rendererBuffers[key] === undefined) {
                    newData.rendererBuffers[key] = rawdata.rendererBuffers[key];
                }
            });

            _.each(_.keys(rawdata.hostBuffers), key => {
                if (newData.hostBuffers[key] === undefined) {
                    newData.hostBuffers[key] = rawdata.hostBuffers[key];
                }
            });

            // Copy in attributes from raw data
            // Bump versions of every attribute because it's versioned.
            // Also mark as dirty, due to filter.
            const attributePropertiesToSkip = ['values'];
            // Each namespace of columns
            _.each(rawdata.attributes, (cols, colCategoryKey) => {
                newData.attributes[colCategoryKey] = {};
                // Each column
                _.each(cols, (col, colName) => {
                    newData.attributes[colCategoryKey][colName] = {};

                    // Each key of column object
                    _.each(col, (prop, propName) => {
                        if (attributePropertiesToSkip.indexOf(propName) === -1) {
                            newData.attributes[colCategoryKey][colName][propName] = prop;
                        }
                    });

                    // Bump Version
                    newData.attributes[colCategoryKey][colName].version = getUniqueId();
                    // Mark dirty so that computed columns and lazy eval can work.
                    newData.attributes[colCategoryKey][colName].dirty = {
                        cause: 'filter'
                    };
                });
            });

            // Bump versions of every buffer.
            // TODO: Decide if this is really necessary.
            _.each(_.keys(simulator.versions.buffers), key => {
                simulator.versions.buffers[key] += 1;
            });
            simulator.versions.tick++;

            this.lastMasks.point = unsortedMasks.point;
            this.lastMasks.edge = unsortedMasks.edge;
        })
        .then(() => {
            logger.debug('Filter Completed in ' + (Date.now() - start) + ' ms.');
            this.data = newData;
            return true; // Signal to recipients that a filter was successfully completed
        });
};

//////////////////////////////////////////////////////////////////////////////
// Data Loading
//////////////////////////////////////////////////////////////////////////////

const SystemAttributeNames = [
    'pointColor',
    'pointSize',
    'pointTitle',
    'pointLabel',
    'edgeLabel',
    'edgeTitle',
    'edgeHeight',
    'degree'
];

Dataframe.prototype.loadComputedColumns = function(computedColumnManager, encodingsManager) {
    // copy in defaults. Copy so we can recover defaults when encodings change
    _.each(defaultColumns, (cols, colType) =>
        _.each(cols, (colDesc, name) =>
            computedColumnManager.loadComputedColumnSpecInternally(colType, name, colDesc)
        )
    );

    _.each(defaultEncodingColumns, (cols, colType) =>
        _.each(cols, (colDesc, name) =>
            computedColumnManager.loadComputedColumnSpecInternally(colType, name, colDesc)
        )
    );

    const attrs = this.data.attributes;
    const activeColumns = computedColumnManager.getActiveColumns();

    // TODO: Don't require them to be explicitly loaded in like this with knowldge
    // of internal structure
    // Functions that look up available column names and fetch values
    // should know how to look aside at this.
    _.each(activeColumns, (cols, colType) => {
        // If no columns exist in category, make obj
        attrs[colType] = attrs[colType] || {};

        _.each(cols, (colDesc, name) => {
            const col = {
                name: name,
                type: colDesc.type,
                version: 0,
                dirty: true,
                computed: true,
                computedVersion: colDesc.version,
                filterable: colDesc.filterable,
                index: colDesc.index,
                graphComponentType: colDesc.graphComponentType,
                numberPerGraphComponent: colDesc.numberPerGraphComponent,
                ArrayVariant: colDesc.ArrayVariant
            };

            attrs[colType][name] = col;
        });
    });
};

Dataframe.prototype.registerNewComputedColumn = function(
    computedColumnManager,
    columnType,
    columnName
) {
    const colDesc = computedColumnManager.getComputedColumnSpec(columnType, columnName);
    const attrs = this.data.attributes;
    attrs[columnType] = attrs[columnType] || {};

    const col = {
        name: columnName,
        type: colDesc.type,
        version: 0,
        dirty: true,
        computed: true,
        computedVersion: colDesc.version,
        filterable: colDesc.filterable,
        index: colDesc.index,
        graphComponentType: colDesc.graphComponentType,
        numberPerGraphComponent: colDesc.numberPerGraphComponent,
        ArrayVariant: colDesc.ArrayVariant
    };

    attrs[columnType][columnName] = col;

    if (this.data !== this.rawdata) {
        const rawAttrs = this.rawdata.attributes;
        rawAttrs[columnType] = rawAttrs[columnType] || {};
        rawAttrs[columnType][columnName] = col;
    }
};

// Add a column given via the client API.
// Values is an arraylike of values, indexed the same way as the unfiltered dataset.
Dataframe.prototype.addClientProvidedColumn = function(
    columnType,
    columnName,
    values,
    dataType = 'string'
) {
    // TODO: Pull this out.
    const acceptedDatatypes = ['number', 'string'];
    const ccManager = this.computedColumnManager;

    if (!_.contains(GraphComponentTypes, columnType)) {
        logger.debug(`Attempted to add invalid column type: ${columnType}`);
        return false;
    }

    if (this.rawdata.attributes[columnType][columnName]) {
        logger.debug(
            `Attempted to overwrite a column in the base dataset: ${columnType}:${columnName}`
        );
        return false;
    }

    if (!values) {
        logger.debug(`Attempted to add a column without valid values.`);
        return false;
    }

    if (!_.contains(acceptedDatatypes, dataType)) {
        logger.debug(`Attempted to add a column with invalid dataType: ${dataType}`);
        return false;
    }

    let ArrayVariant = values.constructor;
    if (ArrayVariant === Object) {
        ArrayVariant = Array;
    }

    const defaultValue = dataType === 'string' ? '' : 0;
    const numElements = this.rawdata.numElements[columnType];

    if (values.length === undefined) {
        values.length = numElements;
    } else if (values.length !== numElements) {
        logger.debug(
            `Warning: Provided values for ${columnType}:${columnName} have different length than original dataset. ${values.length} vs ${numElements}.`
        );
    }

    if (ccManager.hasColumn(columnType, columnName)) {
        logger.debug(
            `Call to add column ${columnType}:${columnName} under name that already exists, replacing old values.`
        );
    }

    let spec = new ComputedColumnSpec({
        ArrayVariant: ArrayVariant,
        type: dataType,
        numberPerGraphComponent: 1,
        graphComponentType: columnType,
        version: 0,
        dependencies: [],
        computeAllValues: (outArr, numGraphElements, lastMasks) => {
            lastMasks.forEachIndexByType(columnType, (idx, i) => {
                let val = values[idx];
                if (val === null || val === undefined) {
                    val = defaultValue;
                }
                outArr[i] = val;
            });
            return outArr;
        }
    });

    ccManager.addComputedColumn(this, columnType, columnName, spec);

    return true;
};

/**
 * TODO: Implicit degrees for points and src/dst for edges.
 * @param {Object.<AttrObject>} attributeObjectsByName
 * @param {string} type - any of [TYPES]{@link BufferTypeKeys}
 * @param {Number} numElements - prescribe or describe? number present by type.
 */
Dataframe.prototype.loadAttributesForType = function(attributeObjectsByName, type, numElements) {
    // Case of loading with no data.
    // if (_.keys(attributeObjectsByName).length === 0) {
    //     return;
    // }

    // TODO: Decoding at the presentation layer.
    // decodeStrings(attributeObjectsByName);
    // decodeDates(attributeObjectsByName);

    const nodeTitleField = pickTitleField(this.bufferAliases, attributeObjectsByName, 'pointTitle');
    const edgeTitleField = pickTitleField(this.bufferAliases, attributeObjectsByName, 'edgeTitle');

    const userDefinedAttributeKeys = _.keys(attributeObjectsByName)
        .filter(name => {
            return SystemAttributeNames.indexOf(name) === -1;
        })
        .filter(name => {
            return name !== nodeTitleField && name !== edgeTitleField;
        });

    const userDefinedAttributesByName = _.pick(attributeObjectsByName, (value, key) => {
        return userDefinedAttributeKeys.indexOf(key) > -1;
    });

    this.rawdata.numElements[type] = numElements;

    if (nodeTitleField) {
        userDefinedAttributesByName._title = attributeObjectsByName[nodeTitleField];
    } else if (edgeTitleField) {
        userDefinedAttributesByName._title = attributeObjectsByName[edgeTitleField];
    } else {
        userDefinedAttributesByName._title = {
            type: 'number',
            name: 'label',
            values: _.range(numElements)
        };
    }

    // Mark version as 0, and that they're not dirty.
    _.each(userDefinedAttributesByName, obj => {
        obj.version = 0;
        obj.dirty = false;
        obj.numberPerGraphComponent = obj.numberPerGraphComponent || 1;
    });

    _.extend(this.rawdata.attributes[type], userDefinedAttributesByName);
    // TODO: Case where data != raw data.
};

/**
 * @param {String} name
 * @param {GraphComponentTypes} type
 * @param {Column} valueObj
 */
Dataframe.prototype.loadColumn = function(name, type, valueObj) {
    valueObj.version = 0;
    valueObj.dirty = false;
    valueObj.numberPerGraphComponent = valueObj.numberPerGraphComponent || 1;

    this.rawdata.attributes[type][name] = valueObj;
};

/**
 *
 * @param {Object.<Column>} attributes
 * @param {String} name
 * @param {String} dataType
 * @param {Array} values
 * @param {String?} keyName defaults to name
 * @returns Column
 */
Dataframe.prototype.defineAttributeOn = function(
    attributes,
    name,
    dataType,
    values,
    keyName = name
) {
    /** @type Column */
    const result = {
        name: name,
        type: dataType,
        values: values,
        version: 0,
        dirty: false,
        numberPerGraphComponent: 1
    };
    attributes[keyName] = result;
    return result;
};

/** Load in degrees as a universal (independent of data source) value
 * @param {Uint32Array} outDegrees - degrees going out of nodes
 * @param {Uint32Array} inDegrees - degrees going into nodes
 */
Dataframe.prototype.loadDegrees = function(outDegrees, inDegrees) {
    const numElements = this.numPoints();
    const attributes = this.rawdata.attributes.point;

    // TODO: Error handling
    if (numElements !== outDegrees.length || numElements !== inDegrees.length) {
        return;
    }

    const degree = new Array(numElements);
    const degreeIn = new Array(numElements);
    const degreeOut = new Array(numElements);

    for (let i = 0; i < numElements; i++) {
        degreeIn[i] = inDegrees[i];
        degreeOut[i] = outDegrees[i];
        degree[i] = inDegrees[i] + outDegrees[i];
    }

    this.defineAttributeOn(attributes, 'degree', 'number', degree);
    this.defineAttributeOn(attributes, 'degree_in', 'number', degreeIn);
    this.defineAttributeOn(attributes, 'degree_out', 'number', degreeOut);
};

/** Load in edge source/destinations as a universal (independent of data source) value
 * @param {Uint32Array} unsortedEdges - unsorted list of edge src/dst indexes.
 */
Dataframe.prototype.loadEdgeDestinations = function(unsortedEdges) {
    const n = unsortedEdges.length;
    const numElements = this.numEdges() || n / 2;
    const attributes = this.rawdata.attributes.edge;
    const nodeTitles = this.rawdata.attributes.point._title.values;

    const source = new Array(numElements);
    const destination = new Array(numElements);

    for (let i = 0; i < numElements; i++) {
        source[i] = nodeTitles[unsortedEdges[i * 2]];
        destination[i] = nodeTitles[unsortedEdges[i * 2 + 1]];
    }

    this.defineAttributeOn(attributes, 'Source', 'string', source);
    this.defineAttributeOn(attributes, 'Destination', 'string', destination);

    // If no title has been set, just make title the index.
    // TODO: Is there a more appropriate place to put this?
    if (!attributes._title) {
        this.defineAttributeOn(attributes, 'label', 'string', _.range(numElements), '_title');
    }
};

/** Load in a raw OpenCL buffer object.
 *  @param {string} name - name of the buffer
 *  @param {string} type - any of [TYPES]{@link BufferTypeKeys}.
 *  @param {Object} buffer - a raw OpenCL buffer object
 */
Dataframe.prototype.loadBuffer = function(name, type, buffer) {
    const buffers = this.rawdata.buffers[type];
    buffers[name] = buffer;
};

Dataframe.prototype.writeBuffer = function(name, type, values, simulator) {
    const byteLength = values.byteLength;
    const buffer = this.rawdata.buffers[type][name];

    // If it's written to directly, we assume we want to also
    // have a buffer to write to during filters.
    return simulator.cl.createBuffer(byteLength, name + 'Filtered').then(filteredBuffer => {
        this.filteredBufferCache.simulator[name] = filteredBuffer;
        return buffer.write(values);
    });
};

/** Load in a host buffer object.
 *  @param {string} name - name of the buffer
 *  @param {Object} buffer - a raw OpenCL buffer object
 */
Dataframe.prototype.loadHostBuffer = function(name, buffer) {
    const hostBuffers = this.rawdata.hostBuffers;
    hostBuffers[name] = buffer;
};

Dataframe.prototype.loadLocalBuffer = function(name, buffer) {
    const localBuffers = this.rawdata.localBuffers;
    localBuffers[name] = buffer;
};

Dataframe.prototype.setLocalBufferValue = function(name, idx, value) {
    const localBuffers = this.rawdata.localBuffers;
    localBuffers[name][idx] = value;
};

Dataframe.prototype.loadRendererBuffer = function(name, buffer) {
    const rendererBuffers = this.rawdata.rendererBuffers;
    rendererBuffers[name] = buffer;
};

Dataframe.prototype.setHostBufferValue = function(name, idx, value) {
    const hostBuffers = this.rawdata.hostBuffers;
    hostBuffers[name][idx] = value;
};

Dataframe.prototype.loadLabels = function(type, labels) {
    this.rawdata.labels[type] = labels;
};

Dataframe.prototype.deleteBuffer = function(name) {
    _.each(BufferTypeKeys, type => {
        _.each(_.keys(this.rawdata.buffers[type]), key => {
            if (key === name) {
                this.rawdata.buffers[type][key].delete();
                this.rawdata.buffers[type][key] = null;
            }
        });
    });
};

Dataframe.prototype.setNumElements = function(type, num) {
    this.rawdata.numElements[type] = num;
};

//////////////////////////////////////////////////////////////////////////////
// Data Access
//////////////////////////////////////////////////////////////////////////////

/**
 * @typedef {Object} ColumnName
 * @property {String} type
 * @property {String} attribute
 */

/**
 * @returns {ColumnName}
 */
Dataframe.prototype.normalizeAttributeName = function(columnName, type) {
    const idx = columnName ? columnName.lastIndexOf(':') : -1;
    let name = columnName;
    if (idx !== -1) {
        type = columnName.substring(0, idx);
        name = columnName.substring(idx + 1);
    }
    return this.getKeyFromName(name, type);
};

/** Given a name, return the key that corresponds to that name.
 * If no match exists, check to see if name is just a key.
 * If it doesn't exist as key, return false.
 * @returns {ColumnName}
 */
Dataframe.prototype.getKeyFromName = function(maybeName, type) {
    // TODO: Maintain an actual lookup instead of iterating through.

    if (type === undefined) {
        return this.getKeyFromName(maybeName, 'point') || this.getKeyFromName(maybeName, 'edge');
    }

    const attributes = this.rawdata.attributes[type];
    const matchKeys = _.filter(_.keys(attributes), key => {
        return attributes[key].name === maybeName || key === maybeName;
    });

    if (matchKeys.length > 1) {
        logger.info(
            'The name ' +
                type +
                ':' +
                maybeName +
                ' is ambiguous, the following matches: ' +
                matchKeys.length
        );
    }

    if (matchKeys.length > 0) {
        return { attribute: matchKeys[0], type: type };
    }

    if (this.data.attributes[type][maybeName] !== undefined) {
        return { attribute: maybeName, type: type };
    }

    return undefined;
};

Dataframe.prototype.getBufferKeys = function(type) {
    return _.sortBy(_.keys(this.data.buffers[type]), _.identity);
};

Dataframe.prototype.getOriginalNumElements = function(type) {
    const res = this.rawdata.numElements[type];
    if (!res && res !== 0) {
        throw new Error('Invalid Num Elements: ' + type);
    }
    return res;
};

Dataframe.prototype.getNumElements = function(type) {
    const res = this.data.numElements[type];
    if (!res && res !== 0) {
        throw new Error('Invalid Num Elements: ' + type);
    }
    return res;
};

Dataframe.prototype.getAllBuffers = function(type) {
    return this.data.buffers[type];
};

/// Buffer reset capability, specific to local buffers for now to make highlight work:

Dataframe.prototype.overlayLocalBuffer = function(type, name, alias, values) {
    if (values) {
        // Use getLocalBuffer to match its constructor, does not care about contents.
        const newUnfilteredBuffer = this.getLocalBuffer(name).constructor(values.length);
        for (let i = 0; i < values.length; i++) {
            newUnfilteredBuffer[i] = values[i];
        }

        // Update rawdata (unfiltered)
        this.rawdata.localBuffers[alias] = newUnfilteredBuffer;

        let numFilteredElements = this.lastMasks.maskSize()[type];

        // TODO figure out how to generically assigned to edges (since some are strides of 2, some are 1)
        if (name === 'edgeColors') {
            numFilteredElements *= 2;
        }

        const newFilteredBuffer = newUnfilteredBuffer.constructor(numFilteredElements);

        // Filter and toss into data.
        // TODO: This is shared code between filtering code and here.
        this.lastMasks.forEachIndexByType(type, (indexInRaw, i) => {
            newFilteredBuffer[i] = newUnfilteredBuffer[indexInRaw];
        });

        this.data.localBuffers[alias] = newFilteredBuffer;
    }
    if (this.hasLocalBuffer(name) && this.hasLocalBuffer(alias)) {
        this.bufferOverlays[name] = { type: type, alias: alias, originalName: name };
    } else {
        throw new Error('Invalid overlay of ' + name + ' to ' + alias);
    }
};

Dataframe.prototype.canResetLocalBuffer = function(name) {
    return this.bufferOverlays[name] !== undefined;
};

Dataframe.prototype.resetLocalBuffer = function(name) {
    if (this.canResetLocalBuffer(name)) {
        delete this.bufferOverlays[name];
    }
};

Dataframe.prototype.hasLocalBuffer = function(name) {
    const hasDeprecatedExplicitLocalBuffer =
        this.data.localBuffers[name] !== undefined || this.rawdata.localBuffers[name] !== undefined;
    const hasComputedLocalBuffer = this.computedColumnManager.hasColumn('localBuffer', name);
    return hasDeprecatedExplicitLocalBuffer || hasComputedLocalBuffer;
};

Dataframe.prototype.getLocalBuffer = function(name, unfiltered) {
    const data = unfiltered ? this.rawdata : this.data;

    if (this.canResetLocalBuffer(name)) {
        const alias = this.bufferOverlays[name] && this.bufferOverlays[name].alias; // Guard against no overlay
        // Prevents a possible race condition resetting a buffer alias/overlay:
        if (this.hasLocalBuffer(alias)) {
            name = alias;
        } else {
            this.resetLocalBuffer(alias);
        }
    }

    const deprecatedExplicitlySetValues = data.localBuffers[name];
    if (deprecatedExplicitlySetValues) {
        return deprecatedExplicitlySetValues;
    }

    // Get values via normal path where they're treated as computed columns.
    // TODO: Deal with "unfiltered code" path. Do we need it with computed columns?
    const res = this.hasLocalBuffer(name) && this.getColumnValues(name, 'localBuffer');

    if (!res) {
        throw new Error('Invalid Local Buffer: ' + name + ', has: ' + this.hasLocalBuffer(name));
    }

    return res;
};

Dataframe.prototype.getHostBuffer = function(name) {
    const deprecatedExplicitlySetValues = this.data.hostBuffers[name];
    if (deprecatedExplicitlySetValues) {
        return deprecatedExplicitlySetValues;
    }

    const res = this.getColumnValues(name, 'hostBuffer');

    if (!res) {
        throw new Error('Invalid Host Buffer: ' + name);
    }

    return res;
};

Dataframe.prototype.hasHostBuffer = function(name) {
    const hasDeprecatedExplicitHostBuffer =
        this.data.hostBuffers[name] !== undefined || this.rawdata.hostBuffers[name] !== undefined;
    const hasComputedHostBuffer = this.computedColumnManager.hasColumn('hostBuffer', name);
    return hasDeprecatedExplicitHostBuffer || hasComputedHostBuffer;
};

Dataframe.prototype.getLabels = function(type) {
    return this.data.labels[type];
};

/** Returns an OpenCL buffer object.
 *  @param {string} name - name of the buffer
 *  @param {string} type - any of [TYPES]{@link BufferTypeKeys}.
 */
Dataframe.prototype.getBuffer = function(name, type) {
    // TODO: Specialize the 'simulator' type case into its own function.
    // It should be treated differently, since we manually load the buffers
    const buffers = this.data.buffers[type];
    const res = buffers[name];

    if (type === 'simulator') {
        return res;
    }

    if (res) {
        return Q(res);
    } else {
        const data = this.data.attributes[type][name].values;
        const dataType = this.getDataType(name, type);

        if (dataType !== 'number') {
            throw new Error(
                'Attempting to get buffer that is non-numeric; data type is: ' + dataType
            );
        }

        const typedData = new Float32Array(data);
        const byteLength = typedData.byteLength;

        return this.simulator.cl
            .createBuffer(byteLength, '_' + type + '_' + name)
            .then(newBuffer => {
                buffers[name] = newBuffer;
                return newBuffer.write(typedData);
            });
    }
};

/** Return the global (ie, unfiltered) index of a node/edge
 * @param{number} index - filtered/local index
 * @param{string} type - any of [TYPES]{@link GraphComponentTypes}.
 */
Dataframe.prototype.globalize = function(index, type) {
    return this.lastMasks.getIndexByType(type, index);
};

Dataframe.prototype.getVersion = function(type, attrName) {
    const attributes = this.data.attributes[type];

    if (!attributes[attrName]) {
        return undefined;
    }

    // If it's a computed column, provide the combination of CC spec version + dataframe version.
    if (attributes[attrName].computed) {
        const ccVersion = this.computedColumnManager.getColumnVersion(type, attrName);
        return '' + ccVersion + ':' + attributes[attrName].version;
    }

    return attributes[attrName].version;
};

/** Returns the contents of one cell
 * @param {double} index - which element to extract.
 * @param {string} type - any of [TYPES]{@link BufferTypeKeys}.
 * @param {string} attrName - the name of the column you want
 */
Dataframe.prototype.getCell = function(index, type, attrName, global = false) {
    const attributes = (global ? this.rawdata : this.data).attributes[type];

    // TODO FIXME HACK:
    // So computed column manager can work, we need to pass through calls from here
    // to getHostBuffer.

    if (type === 'hostBuffer' && (!attributes || !attributes[attrName])) {
        return this.getHostBuffer(attrName)[index];
    }

    if (type === 'localBuffer' && (!attributes || !attributes[attrName])) {
        return this.getLocalBuffer(attrName)[index];
    }

    const column = attributes[attrName];

    if (!column) {
        return undefined;
    }

    const numberPerGraphComponent = column.numberPerGraphComponent;

    // First try to see if have values already calculated / cached for this frame

    // Check to see if it's computed and version matches that of computed column.
    // Computed column versions reflect dependencies between computed columns.
    let computedVersionMatches = !(
        column.computed &&
        column.computedVersion !== this.computedColumnManager.getColumnVersion(type, attrName)
    );

    if (computedVersionMatches && !column.dirty && column.values) {
        // TODO: Deduplicate this code from dataframe and computed column manager
        if (numberPerGraphComponent === 1) {
            return column.values[index];
        } else {
            const ArrayVariant = column.ArrayVariant || Array;
            const returnArr = new ArrayVariant(numberPerGraphComponent);
            for (let j = 0; j < returnArr.length; j++) {
                returnArr[j] = column.values[index * numberPerGraphComponent + j];
            }
            return returnArr;
        }
    }

    // If it's calculated and needs to be recomputed
    if (column.computed) {
        return this.computedColumnManager.getValue(this, type, attrName, index);
    }

    // If it's not calculated / cached, and filtered use last masks (parent) to index into already
    // calculated values
    if (column.dirty && column.dirty.cause === 'filter') {
        let parentIndex = this.lastMasks.getIndexByType(type, index);
        let parentValue;
        try {
            parentValue = this.rawdata.attributes[type][attrName].values[parentIndex];
            return parentValue;
        } catch (err) {
            logger.error({ err, type, attrName, index, parentIndex });
        }
    }

    // Nothing was found, so throw error.
    throw new Error("Couldn't get cell value for: " + attrName + ' ' + index);
};

// Defines the order in which system columns are typically interesting:
const CommonAttributeNamesSortedByInterestLevel = [
    'degree',
    'community_infomap',
    'community_louvain',
    'community_spinglass',
    'betweenness',
    'centrality',
    'closeness',
    'pagerank',
    'weight',
    'degree_in',
    'degree_out',
    'indegree',
    'outdegree',
    'Source',
    'Destination',
    '__nodeid__',
    'id'
];

Dataframe.prototype.CommonAttributeNamesSortedByInterestLevel = CommonAttributeNamesSortedByInterestLevel;

Dataframe.prototype.publicColumnNamesByType = function publicColumnNamesByType(type) {
    const keys = _.filter(
        _.keys(this.rawdata.attributes[type]),
        columnName => !this.isAttributeNameInternal(columnName)
    );
    keys.sort(
        (a, b) =>
            CommonAttributeNamesSortedByInterestLevel.indexOf(a) -
            CommonAttributeNamesSortedByInterestLevel.indexOf(b)
    );
    return keys;
};

/** Returns one row object.
 * @param {Number} index - which element to extract.
 * @param {String} type - any of [TYPES]{@link BufferTypeKeys}.
 * @param {String[]?} columnNames
 */
Dataframe.prototype.getRowAt = function(
    index,
    type,
    columnNames = this.publicColumnNamesByType(type),
    global = false
) {
    const origIndex = index; // For client-side metadata

    const row = {};
    _.each(columnNames, columnName => {
        row[columnName] = this.getCell(index, type, columnName, global);
    });
    row._index = origIndex;
    return row;
};

/** Returns array of row (fat json) objects.
 * @param {Array.<number>} indices - which elements to extract.
 * @param {BufferTypeKeys} type
 * @param {String[]} columnNames
 */
Dataframe.prototype.getRows = function(
    indices,
    type,
    columnNames = this.publicColumnNamesByType(type),
    global = false
) {
    const mask = new DataframeMask(this);
    mask[type] = indices;

    return mask.mapIndexesByType(type, (index, i) => {
        return this.getRowAt(index, type, columnNames, global);
    });
};

/** Returns a descriptor of a set of rows.
 * This works relative to UNSORTED edge orders, since it's meant
 * for serializing raw data.
 * @param {Mask} mask - which elements to extract.
 * @param {GraphComponentTypes} type
 * @param {String[]} columnNames
 * @returns {{header: Array<String, values: Array<Array>}}
 */
Dataframe.prototype.getRowsCompactUnfiltered = function(
    mask,
    type,
    columnNames = this.getAttributeKeys(type)
) {
    // TODO: Should this be generalized for non-serializing purposes? E.g., it's not in the standard lookup path.
    const columnValuesByName = _.object(
        columnNames,
        _.map(columnNames, columnName => this.getColumn(columnName, type).values)
    );
    const numColumns = columnNames.length;

    const localizedMask = new DataframeMask(this);
    localizedMask[type] = mask;

    const lastMasks = this.lastMasks;

    //{string -> string}
    const colNameToType = _.object(
        columnNames,
        columnNames.map(key => this.getDataType(key, type))
    );

    const values = localizedMask.mapIndexesByType(type, localIndex => {
        const index = lastMasks.getIndexByType(type, localIndex);
        const row = new Array(numColumns);

        _.each(columnNames, (key, i) => {
            const value = columnValuesByName[key][index];
            const colType = colNameToType[key];
            // This is serialization-specific logic to avoid unusable CSV output. Hoist as necessary:
            row[i] =
                //unsafe NaN check so don't pollute valueSignifiesUndefined
                value === 'NaN'
                    ? ''
                    : dataTypeUtil.valueSignifiesUndefined(value)
                      ? ''
                      : colType === 'date' || colType === 'dateime'
                        ? new Date(value).toISOString()
                        : value;
        });
        return row;
    });

    return {
        header: columnNames,
        values: values
    };
};

/** Answers the type for the column name and type (point/edge). */
Dataframe.prototype.getDataType = function(columnName, type) {
    // Assumes that types don't change after filtering
    return (
        this.rawdata.attributes[type][columnName] && this.rawdata.attributes[type][columnName].type
    );
};

/** Stand-in for a real Column type for now.
 * @typedef {Object} Column
 * @property {Array} values - the values held per row in the iteration type.
 * @property {GraphComponentTypes} type - the iteration type.
 * @property {Object} target
 * @property {Number} version - auto-incrementing positive version integer
 * @property {Boolean} dirty - implies dependencies have changed
 * @property {Number} numberPerGraphComponent - number of items in this column per core shape by type.
 * @property {ColumnAggregation} aggregations
 */

Dataframe.prototype.reIndexArray = function(columnName, type, arr, indexType) {
    if (!indexType) {
        return arr;
    }

    // Return an array indexed/sorted on the sorted array indexing.
    // TODO: Kill this
    if (indexType === 'sortedEdge') {
        return arr;
    }

    // Nothing was found, so throw error.
    throw new Error(
        'Attempted to reindex array with invalid index type: ',
        columnName,
        type,
        indexType
    );
};

// TODO: Have this return edge attributes in sorted order, unless
// explicitly requested to be unsorted (for internal performance reasons)
Dataframe.prototype.getColumnValues = function(columnName, type, global = false) {
    const attributes = (global ? this.rawdata : this.data).attributes[type];

    // TODO FIXME HACK:
    // So computed column manager can work, we need to pass through calls from here
    // to getHostBuffer.

    if (type === 'hostBuffer' && (!attributes || !attributes[columnName])) {
        // Don't reindex because legacy
        return this.getHostBuffer(columnName);
    }

    if (type === 'localBuffer' && (!attributes || !attributes[columnName])) {
        // Don't reindex because legacy
        return this.getLocalBuffer(columnName);
    }

    const column = attributes[columnName] || this.getColumn(columnName, type, global);

    // This lets us know if we need to reindex the values,
    // e.g., go from unsorted to sorted.
    const indexType = column.index;

    // First try to see if have values already calculated / cached for this frame

    // Check to see if it's computed and version matches that of computed column.
    // Computed column versions reflect dependencies between computed columns.
    const computedVersionMatches = !(
        column.computed &&
        column.computedVersion !== this.computedColumnManager.getColumnVersion(type, columnName)
    );

    if (computedVersionMatches && !column.dirty && column.values) {
        return this.reIndexArray(columnName, type, column.values, indexType, column);
    }

    // If it's calculated and needs to be recomputed
    if (column.computed && (!computedVersionMatches || column.dirty)) {
        const newValues = this.computedColumnManager.getDenseMaterializedArray(
            this,
            type,
            columnName
        );
        column.values = newValues;
        column.dirty = false;

        return this.reIndexArray(columnName, type, newValues, indexType, column);
    }

    // If it's not calculated / cached, and filtered, apply the mask and compact
    // then cache the result.
    if (column.dirty && column.dirty.cause === 'filter') {
        const unfilteredAttributes = this.rawdata.attributes[type];
        const unfilteredColumn =
            unfilteredAttributes[columnName] || this.getColumn(columnName, type, true);
        const ArrayVariant = unfilteredColumn.ArrayVariant || Array;
        const numNewValues = this.lastMasks.numByType(type);
        const numberPerGraphComponent = unfilteredColumn.numberPerGraphComponent;
        const newValues = new ArrayVariant(numberPerGraphComponent * numNewValues);

        this.lastMasks.forEachIndexByType(type, (idx, i) => {
            for (let j = 0; j < numberPerGraphComponent; j++) {
                newValues[numberPerGraphComponent * i + j] =
                    unfilteredColumn.values[numberPerGraphComponent * idx + j];
            }
            // newValues.push(rawAttributes[columnName].values[idx]);
        });

        column.values = newValues;
        column.dirty = false;

        return this.reIndexArray(columnName, type, newValues, indexType, column);
    }

    // Nothing was found, so throw error.
    throw new Error("Couldn't get column values for: " + columnName);
};

// TODO: Track modifications to underlying GPU buffer,
// so we can flag them as dirty='CL' or something and know to copy off GPU.
Dataframe.prototype.getClBuffer = function(cl, columnName, type) {
    const attributes = this.data.attributes[type];

    // TODO FIXME HACK:
    // So computed column manager can work, we need to pass through calls from here
    // to getHostBuffer.

    // if (type === 'hostBuffer' && (!attributes || !attributes[columnName])) {
    //     return this.getHostBuffer(columnName);
    // }

    // if (type === 'localBuffer' && (!attributes || !attributes[columnName])) {
    //     return this.getLocalBuffer(columnName);
    // }

    // Check to see if our buffer is not dirty, and that we have buffer values.
    const computedVersionMatches = !(
        attributes[columnName].computed &&
        attributes[columnName].computedVersion !==
            this.computedColumnManager.getColumnVersion(type, columnName)
    );

    if (
        computedVersionMatches &&
        !attributes[columnName].dirty &&
        attributes[columnName].clBuffer
    ) {
        return Q(attributes[columnName].clBuffer);
    }

    // Need to fix CL Buffer. Today, naively get all columns and do a full copy.
    // In the future, do this more cleverly (e.g., GPU filter + compact)

    const newValues = this.getColumnValues(columnName, type);

    // TODO: Add eviction to generic CL Buffer caching.
    return this.getCachedCLBuffer(cl, columnName, type)
        .then(buffer => {
            return buffer.write(newValues);
        })
        .then(buffer => {
            attributes[columnName].clBuffer = buffer;
            return buffer;
        });
};

// TODO: Add eviction to generic CL Buffer caching.
Dataframe.prototype.getCachedCLBuffer = function(cl, columnName, type) {
    const desc = this.data.attributes[type][columnName];
    const ArrayVariant = desc.ArrayVariant;

    if (ArrayVariant === Array) {
        throw new Error('Attempted to make CL Buffer for non-typed array: ', columnName, type);
    }

    const graphComponentType = desc.graphComponentType || type;
    const numElements = this.getNumElements(graphComponentType);

    this.clBufferCache[type] = this.clBufferCache[type] || {};
    const cache = this.clBufferCache[type];

    // TODO: Deal with size not being sufficient.
    if (cache[columnName]) {
        if (cache[columnName].size < ArrayVariant.BYTES_PER_ELEMENT * numElements) {
            // TODO: Evict from cache and do necessary GC
            throw new Error(
                'Did not implement resizing of cached CL buffers yet for: ',
                columnName,
                type
            );
        }

        return Q(cache[columnName]);
    }

    // Not cached, so create and cache
    return cl
        .createBuffer(
            numElements * ArrayVariant.BYTES_PER_ELEMENT,
            'clBuffer_' + type + '_' + columnName
        )
        .then(buffer => {
            cache[columnName] = buffer;
            return buffer;
        });
};

/** @typedef {Object} ValueCount
 * @property {Object} distinctValue
 * @property {Number} count
 */

Dataframe.prototype.metadataForColumn = function(columnName, type) {
    let metadata, defsContainer;
    if (this.metadata !== undefined) {
        switch (type) {
            case 'point':
                defsContainer = this.metadata.nodes;
                break;
            case 'edge':
                defsContainer = this.metadata.edges;
                break;
        }
    }
    const defs = _.find(defsContainer, eachDefs => eachDefs[columnName] !== undefined);
    if (defs !== undefined) {
        metadata = defs[columnName];
    }
    return metadata;
};

/**
 * @returns {ColumnAggregation}
 */
Dataframe.prototype.getColumnAggregations = function(columnName, type, global = true) {
    const column = this.getColumn(columnName, type, global);
    if (column === undefined) {
        return undefined;
    }
    if (column.aggregations === undefined) {
        column.aggregations = new ColumnAggregation(this, column, columnName, type);
        let columnMetadata = this.metadataForColumn(columnName, type);
        if (columnMetadata !== undefined) {
            if (columnMetadata.aggregations !== undefined) {
                columnMetadata = columnMetadata.aggregations;
            }
            column.aggregations.updateAggregations(columnMetadata);
        }
    }
    return column.aggregations;
};

/** Auto-detect when a buffer is filled with our ETL-defined color space and map that directly:
 * TODO don't have ETL magically encode the color space; it doesn't save space, time, code, or style.
 * @returns {Boolean}
 */
Dataframe.prototype.doesColumnRepresentColorPaletteMap = function(type, columnName) {
    return (
        (type === 'edge' && columnName === 'edgeColor') ||
        (type === 'point' && columnName === 'pointColor')
    );
};

Dataframe.prototype.getAttributeKeys = function(type) {
    // Assumes that filtering doesn't add/remove columns
    // TODO: Generalize so that we can add/remove columns
    return _.sortBy(_.keys(this.rawdata.attributes[type]), _.identity);
};

/**
 * @param {String} columnName
 * @param {GraphComponentTypes} type
 * @returns {Boolean}
 */
Dataframe.prototype.hasColumnNamed = function(type, columnName) {
    const columnsByAttribute = this.rawdata.attributes[type];
    return (
        columnsByAttribute.hasOwnProperty(columnName) ||
        _.any(columnsByAttribute, column => column.name === columnName)
    );
};

const LargeColumnProperties = ['values', 'aggregations'];

/**
 * @param {String} columnName
 * @param {GraphComponentTypes} type
 * @param {Boolean?} global
 * @param {Boolean?} forSerialization - Whether to ensure JSON serialization is reasonable.
 * @returns Column
 */
Dataframe.prototype.getColumn = function(
    columnName,
    type,
    global = true,
    forSerialization = false
) {
    const dataframeData = global ? this.rawdata : this.data;
    const columnsForType = dataframeData.attributes[type];
    const column =
        columnsForType[columnName] ||
        _.find(columnsForType, eachColumn => eachColumn.name === columnName);
    if (forSerialization) {
        return _.omit(column, LargeColumnProperties);
    } else {
        return column;
    }
};

Dataframe.prototype.getAttributeKeyForColumnName = function(columnName, type) {
    const columnsForType = this.rawdata.attributes[type];
    return columnsForType.hasOwnProperty(columnName)
        ? columnName
        : _.findKey(columnsForType, column => column.name === columnName);
};

Dataframe.prototype.isAttributeNamePrivate = function(columnName) {
    return columnName.length > 0 && columnName[0] === '_';
};

Dataframe.prototype.isAttributeNameInternal = function(columnName) {
    return (
        this.isAttributeNamePrivate(columnName) && columnName.length > 1 && columnName[1] === '_'
    );
};

Dataframe.prototype.getColumnsByType = function(forSerialization = false) {
    const result = {};
    _.each(GraphComponentTypes, typeName => {
        const typeResult = {};
        const columnNamesPerType = this.getAttributeKeys(typeName);
        _.each(columnNamesPerType, columnName => {
            const column = this.getColumn(columnName, typeName, true, forSerialization);
            typeResult[columnName] = column;
            if (column.name !== undefined && column.name !== columnName) {
                typeResult[column.name] = column;
            }
        });
        result[typeName] = typeResult;
    });
    return result;
};

//////////////////////////////////////////////////////////////////////////////
// Data Serialization
//////////////////////////////////////////////////////////////////////////////

/** Serialize the dataframe to the target in JSON format in row-wise order.
 * @param {String} target - filename to write to.
 * @param {Object} options - has flags 'compact' and 'compress'
 */
Dataframe.prototype.serializeRows = function(target, options = {}) {
    // TODO: Async file write.
    const toSerialize = {};

    _.each(BufferTypeKeys, type => {
        if (options.compact) {
            toSerialize[type] = this.getRowsCompactUnfiltered(undefined, type);
        } else {
            toSerialize[type] = this.getRows(undefined, type);
        }
    });

    serialize(toSerialize, options.compress, target);
};

/** Serialize the dataframe to the target in JSON format in column-wise order.
 * @param {String} target - filename to write to.
 * @param {Object} options - has flags 'compact' and 'compress'
 */
Dataframe.prototype.serializeColumns = function(target, options = {}) {
    const toSerialize = {};

    _.each(BufferTypeKeys, type => {
        toSerialize[type] = {};
        const keys = this.getAttributeKeys(type);
        _.each(keys, key => {
            toSerialize[type][key] = this.getColumnValues(key, type);
        });
    });

    serialize(toSerialize, options.compress, target);
};

/** Return a promise of a string CSV representation of the dataframe
 */
Dataframe.prototype.formatAsCSV = function(type) {
    const compact = this.getRowsCompactUnfiltered(undefined, type === 'event' ? 'point' : type);
    const promiseStringify = Q.denodeify(csv.stringify);
    const typeColIdx = compact.header.indexOf('type');
    if (type === 'event' && typeColIdx === -1) {
        return promiseStringify([[], []]);
    }

    const structuredArrays = [compact.header].concat(
        type === 'event' ? compact.values.filter(v => v[typeColIdx] === 'EventID') : compact.values
    );

    return promiseStringify(structuredArrays);
};

//////////////////////////////////////////////////////////////////////////////
// Helper Functions
//////////////////////////////////////////////////////////////////////////////

function pickTitleField(aliases, attributes, field) {
    const mapped = aliases[field];
    if (mapped && mapped in attributes) {
        return mapped;
    } else {
        const oldDeprecatedNames = [field, 'node', 'label', 'edge'];
        return _.find(oldDeprecatedNames, f => attributes.hasOwnProperty(f));
    }
}

function serialize(data, compressFunction, target) {
    let serialized = JSON.stringify(data);

    if (compressFunction) {
        serialized = compressFunction(serialized);
    }

    fs.writeFileSync(baseDirPath + target, serialized);
}

function computeEdgeList(edges, oldEncapsulated, masks, pointOriginalLookup) {
    const edgeListTyped = new Uint32Array(edges.length);
    const mapped = new Uint32Array(edges.length / 2);
    let i, src, dst, idx;

    // If we're filtering and have information on unfiltered data.
    // TODO: Undisable once this is fixed with multi-edge / self edge.
    if (false && oldEncapsulated && masks) {
        const oldEdges = oldEncapsulated.edgesTyped;
        const oldPermutation = oldEncapsulated.edgePermutationInverseTyped;
        let lastOldIdx = 0;

        // Lookup to see if an edge is included.
        const edgeLookup = {};
        for (i = 0; i < edges.length / 2; i++) {
            src = edges[i * 2];
            dst = edges[i * 2 + 1];
            if (!edgeLookup[src]) {
                edgeLookup[src] = [];
            }
            edgeLookup[src].push(dst);
        }

        const mappedMaskInverse = new Uint32Array(oldPermutation.length);
        for (i = 0; i < mappedMaskInverse.length; i++) {
            mappedMaskInverse[i] = 1;
        }

        for (i = 0; i < edges.length / 2; i++) {
            while (lastOldIdx < oldEdges.length / 2) {
                src = pointOriginalLookup[oldEdges[lastOldIdx * 2]];
                dst = pointOriginalLookup[oldEdges[lastOldIdx * 2 + 1]];

                if (edgeLookup[src] && edgeLookup[src].indexOf(dst) > -1) {
                    edgeListTyped[i * 2] = src;
                    edgeListTyped[i * 2 + 1] = dst;
                    mapped[i] = oldPermutation[lastOldIdx];
                    mappedMaskInverse[oldPermutation[lastOldIdx]] = 0;
                    lastOldIdx++;
                    break;
                } else {
                    lastOldIdx++;
                }
            }
        }
        // Compute Scan of mappedMask:
        const mappedScan = new Uint32Array(mappedMaskInverse.length);
        mappedScan[0] = mappedMaskInverse[0];
        for (i = 1; i < mappedMaskInverse.length; i++) {
            mappedScan[i] = mappedMaskInverse[i] + mappedScan[i - 1];
        }

        for (i = 0; i < mapped.length; i++) {
            idx = mapped[i];
            mapped[i] = idx - mappedScan[idx];
        }

        // First time through.
    } else {
        const maskedEdgeList = new Float64Array(edgeListTyped.buffer);
        const maskedEdges = new Float64Array(edges.buffer);

        for (i = 0; i < mapped.length; i++) {
            mapped[i] = i;
        }

        Array.prototype.sort.call(mapped, (a, b) => {
            return edges[a * 2] - edges[b * 2] || edges[a * 2 + 1] - edges[b * 2 + 1] || a - b;
        });

        for (i = 0; i < edges.length / 2; i++) {
            idx = mapped[i];
            // It's slightly faster to copy it in using a 64 bit "cast"
            // than to do it directly. Because this is a hot code path, we do this.

            maskedEdgeList[i] = maskedEdges[idx];
            // edgeListTyped[i*2] = edges[idx*2];
            // edgeListTyped[i*2 + 1] = edges[idx*2 + 1];
        }
    }

    return {
        edgeListTyped: edgeListTyped,
        originals: mapped
    };
}

function computeWorkItemsTyped(edgesTyped, originals, numPoints) {
    // [ [first edge number from src idx, numEdges from source idx, source idx], ... ]
    const workItemsTyped = new Int32Array(numPoints * 4);
    let edgeListLastPos = 0;
    let edgeListLastSrc = edgesTyped[0];
    const numEdges = edgesTyped.length / 2;
    for (let i = 0; i < numPoints; i++) {
        // Case where node has edges
        if (edgeListLastSrc === i) {
            const startingIdx = edgeListLastPos;
            let count = 0;
            while (edgeListLastPos < numEdges && edgesTyped[edgeListLastPos * 2] === i) {
                count++;
                edgeListLastPos++;
            }
            edgeListLastSrc = edgeListLastPos < numEdges ? edgesTyped[edgeListLastPos * 2] : -1;
            workItemsTyped[i * 4] = startingIdx;
            workItemsTyped[i * 4 + 1] = count;
            workItemsTyped[i * 4 + 2] = i;
            // Case where node has no edges
        } else {
            workItemsTyped[i * 4] = -1;
            workItemsTyped[i * 4 + 1] = 0;
            workItemsTyped[i * 4 + 2] = i;
        }
    }

    return workItemsTyped;
}

function computeEdgeStartEndIdxs(workItemsTyped, edgesTyped, originals, numPoints) {
    //const index = 0;
    const edgeStartEndIdxsTyped = new Uint32Array(numPoints * 2);
    for (let i = 0; i < workItemsTyped.length / 4 - 1; i++) {
        const start = workItemsTyped[i * 4];
        if (start === -1) {
            edgeStartEndIdxsTyped[i * 2] = -1;
            edgeStartEndIdxsTyped[i * 2 + 1] = -1;
        } else {
            let end = workItemsTyped[(i + 1) * 4];
            let j = i + 1;
            while (end < 0 && j + 1 < workItemsTyped.length / 4) {
                end = workItemsTyped[(j + 1) * 4];
                j++;
            }

            if (end === -1) {
                end = edgesTyped.length / 2; // Special case for last work item
            }
            edgeStartEndIdxsTyped[i * 2] = start;
            edgeStartEndIdxsTyped[i * 2 + 1] = end;
        }
    }
    if (workItemsTyped[workItemsTyped.length - 4] !== -1) {
        edgeStartEndIdxsTyped[edgeStartEndIdxsTyped.length - 2] =
            workItemsTyped[workItemsTyped.length - 4];
        edgeStartEndIdxsTyped[edgeStartEndIdxsTyped.length - 1] = edgesTyped.length / 2;
    } else {
        edgeStartEndIdxsTyped[edgeStartEndIdxsTyped.length - 2] = -1;
        edgeStartEndIdxsTyped[edgeStartEndIdxsTyped.length - 1] = -1;
    }
    return edgeStartEndIdxsTyped;
}

function computeEdgeHeightInfo(edges) {
    const numEdges = edges.length / 2;

    const heights = new Uint32Array(numEdges);
    const seqLens = new Uint32Array(numEdges);

    let prevSrcIdx = -1;
    let prevDstIdx = -1;
    let heightCounter = 0;
    let edgeSeqLen = 1;

    for (let i = 0; i < numEdges; i++) {
        const srcIdx = edges[i * 2];
        const dstIdx = edges[i * 2 + 1];

        if (prevSrcIdx === srcIdx && prevDstIdx === dstIdx) {
            heightCounter++;
        } else {
            heightCounter = 0;
            let j;

            // TODO: Make this faster and clearer
            for (
                j = i + 1;
                j < numEdges && srcIdx === edges[2 * j] && dstIdx === edges[2 * j + 1];
                j++
            ) {}
            edgeSeqLen = j - i + 1;
        }

        heights[i] = heightCounter;
        seqLens[i] = edgeSeqLen;

        prevSrcIdx = srcIdx;
        prevDstIdx = dstIdx;
    }

    return {
        heights,
        seqLens
    };
}

Dataframe.prototype.encapsulateEdges = function(
    edges,
    numPoints,
    oldEncapsulated,
    masks,
    pointOriginalLookup
) {
    //[[src idx, dest idx, original idx]]
    const edgeListObj = computeEdgeList(edges, oldEncapsulated, masks, pointOriginalLookup);
    const edgesTyped = edgeListObj.edgeListTyped;
    const originals = edgeListObj.originals;

    const edgePermutationInverseTyped = originals;
    // const edgePermutationTyped = originals;
    const edgePermutationTyped = new Uint32Array(edgesTyped.length / 2);
    _.each(edgePermutationInverseTyped, (val, i) => {
        edgePermutationTyped[val] = i;
    });

    // [ [first edge number from src idx, numEdges from source idx, source idx], ... ]
    //workItemsTyped is a Uint32Array [first edge number from src idx, number of edges from src idx, src idx, 666]
    const workItemsTyped = computeWorkItemsTyped(edgesTyped, originals, numPoints);

    const degreesTyped = new Uint32Array(numPoints);
    const srcToWorkItem = new Int32Array(numPoints);

    for (let i = 0; i < numPoints; i++) {
        srcToWorkItem[workItemsTyped[i * 4 + 2]] = i;
        degreesTyped[workItemsTyped[i * 4 + 2]] = workItemsTyped[i * 4 + 1];
    }

    const edgeStartEndIdxsTyped = computeEdgeStartEndIdxs(
        workItemsTyped,
        edgesTyped,
        originals,
        numPoints
    );

    const { heights, seqLens } = computeEdgeHeightInfo(edgesTyped);

    return {
        //Uint32Array
        //out degree by node idx
        degreesTyped: degreesTyped,

        //Uint32Array [(srcIdx, dstIdx), ...]
        //(edges ordered by src idx)
        edgesTyped: edgesTyped,

        //Uint32Array [where unsorted edge now sits]
        // map original idx -> new idx
        edgePermutation: edgePermutationTyped,

        //Uint32Array [where sorted edge used to it]
        // map new idx -> original idx
        edgePermutationInverseTyped: edgePermutationInverseTyped,

        //Uint32Array [(edge number, number of sibling edges), ... ]
        numWorkItems: workItemsTyped.length,

        //Int32Array [(first edge number, number of sibling edges)]
        workItemsTyped: workItemsTyped,

        //Uint32Array [work item number by node idx]
        srcToWorkItem: srcToWorkItem,

        edgeStartEndIdxsTyped: edgeStartEndIdxsTyped,

        heights,

        seqLens
    };
};

export default Dataframe;

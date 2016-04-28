'use strict';

const _ = require('underscore');
const dateFormat = require('dateformat');
const Q = require('q');
const fs = require('fs');
const csv = require('csv');
const flake = require('simpleflake');

const log = require('common/logger.js');
const logger = log.createLogger('graph-viz', 'graph-viz/js/DataFrame.js');

const ExpressionCodeGenerator = require('./expressionCodeGenerator');
const ExpressionPlan = require('./ExpressionPlan.js');
const DataframeMask = require('./DataframeMask.js');
const ColumnAggregation = require('./ColumnAggregation.js');
const ComputedColumnManager = require('./ComputedColumnManager.js');

const dataTypeUtil = require('./dataTypes.js');

const palettes    = require('./palettes');

const baseDirPath = __dirname + '/../assets/dataframe/';

function getUniqueId () {
    const id = flake();
    const stringId = id.toString('hex');
    return stringId;
}

/**
 * @readonly
 * @type {string[]}
 */
const GraphComponentTypes = ['point', 'edge'];
/**
 * @readonly
 * @type {string[]}
 */
const BufferTypeKeys = GraphComponentTypes.concat('simulator');

/**
 * @property {DataframeData} rawdata The original data, immutable by this object.
 * @property {DataframeData} data The potentially-filtered data, starts as a reference to original.
 * @property {Object.<DataframeMask>} masksForVizSets Masks stored by VizSet id.
 * @constructor
 */
function Dataframe () {
    // We keep a copy of the original data, plus a filtered view
    // that defaults to the new raw data.
    //
    // This is to allow tools like filters/selections to propagate to
    // all other tools that rely on data frames.

    this.rawdata = makeEmptyData();
    this.filteredBufferCache = {
        point: {},
        edge: {},
        simulator: {}
    };
    this.typedArrayCache = {};
    this.clBufferCache = {};
    this.lastPointPositions = null;
    this.computedColumnManager = null;
    /** The last mask applied as a result of in-place filtering. Full by default. */
    this.lastMasks = new DataframeMask(
        this,
        undefined,
        undefined
    );
    /** The last mask applied as a result of selections. Empty by default. */
    this.lastSelectionMasks = this.newEmptyMask();
    this.masksForVizSets = {};
    this.bufferAliases = {};
    this.data = this.rawdata;
    this.bufferOverlays = {};
    /** @type {DataframeMetadata} */
    this.metadata = {};

    // TODO: Move this out of data frame constructor.
    const computedColumnManager = new ComputedColumnManager();
    computedColumnManager.loadDefaultColumns();
    computedColumnManager.loadEncodingColumns();
    this.loadComputedColumnManager(computedColumnManager);

}

Dataframe.prototype.newEmptyMask = function () {
    return new DataframeMask(this, [], []);
};

/**
 * @typedef {Object} DataframeData
 * @property {{point: Object, edge: Object, simulator: SimCL}} attributes
 * @property {{point: Object, edge: Object, simulator: SimCL}} buffers
 * @property {Object} labels
 * @property {Object} hostBuffers
 * @property {Object} localBuffers
 * @property {Object} rendererBuffers
 * @property {{point: Number, edge: Number}} numElements
 */

/**
 * @returns {DataframeData}
 */
function makeEmptyData () {
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
        labels: {

        },
        // TODO: Can we deal with this more naturally?
        hostBuffers: {

        },
        localBuffers: {

        },
        rendererBuffers: {

        },
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
Dataframe.prototype.pruneMaskEdges = function (oldMask) {

    // Create hash to lookup which points/edges exist in mask.
    const pointMaskOriginalLookup = {};
    oldMask.mapPointIndexes((idx) => {
        pointMaskOriginalLookup[idx] = 1;
    });

    const edgeMask = [];
    const edges = this.rawdata.hostBuffers.unsortedEdges;

    oldMask.mapEdgeIndexes((edgeIdx) => {
        const src = edges[2*edgeIdx];
        const dst = edges[2*edgeIdx + 1];
        const newSrc = pointMaskOriginalLookup[src];
        const newDst = pointMaskOriginalLookup[dst];
        if (newSrc && newDst) {
            edgeMask.push(edgeIdx);
        }
    });

    return new DataframeMask(
        this,
        oldMask.point,
        edgeMask
    );

};


/**
 * Takes a mask and excludes points disconnected by it.
 * Uses encapsulateEdges' result of degreesTyped on forwardsEdges and backwardsEdges.
 * @param {DataframeMask} baseMask
 * @returns {DataframeMask}
 */
Dataframe.prototype.pruneOrphans = function (baseMask) {
    const resultPointMask = [];
    if (baseMask.numPoints() === this.numPoints() && baseMask.numEdges() === this.numEdges()) {
        const degreeColumn = this.getColumnValues('degree', 'point');
        baseMask.mapPointIndexes((pointIdx) => {
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
        baseMask.mapPointIndexes((pointIdx, idx) => {
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


Dataframe.prototype.numByType = function (componentType) {
    return this.rawdata.numElements[componentType];
};


/**
 * @returns Mask
 */
Dataframe.prototype.fullPointMask = function() {
    return _.range(this.numPoints());
};

/**
 * @returns Mask
 */
Dataframe.prototype.fullEdgeMask = function() {
    return _.range(this.numEdges());
};


/**
 * @returns DataframeMask
 */
Dataframe.prototype.fullDataframeMask = function() {
    return new DataframeMask(
        this,
        undefined,
        undefined
    );
};


Dataframe.prototype.presentVizSet = function (vizSet) {
    if (!vizSet || vizSet.masks === undefined) { return vizSet; }
    const maskResponseLimit = 3e4;
    const masksTooLarge = vizSet.masks.numPoints() > maskResponseLimit ||
        vizSet.masks.numEdges() > maskResponseLimit;
    const response = masksTooLarge ? _.omit(vizSet, ['masks']) : _.clone(vizSet);
    response.sizes = {point: vizSet.masks.numPoints(), edge: vizSet.masks.numEdges()};
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
Dataframe.prototype.composeMasks = function (selectionMasks, exclusionMasks, limits) {
    if (!limits) {
        limits = {point: Infinity, edge: Infinity};
    }
    _.each(GraphComponentTypes, (type) => {
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
    _.each(selectionMasks, (mask) => {
        mask.mapEdgeIndexes((idx) => {
            numMasksSatisfiedByEdgeID[idx]++;
        });

        mask.mapPointIndexes((idx) => {
            numMasksSatisfiedByPointID[idx]++;
        });
    });

    // Equivalent to reduce over NOT OR:
    _.each(exclusionMasks, (mask) => {
        mask.mapPointIndexes((idx) => {
            numMasksSatisfiedByPointID[idx] = 0;
        });
        mask.mapEdgeIndexes((idx) => {
            numMasksSatisfiedByEdgeID[idx] = 0;
        });
    });

    // The overall masks per type, made by mask intersection:
    const result = new DataframeMask(
        this,
        [],
        []
    );

    _.each(GraphComponentTypes, (type) => {
        const limit = limits[type],
            numMasksSatisfiedByID = type === 'edge' ? numMasksSatisfiedByEdgeID : numMasksSatisfiedByPointID,
            targetMask = result[type];
        for (let i=0; i<numMasksSatisfiedByID.length; i++) {
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
Dataframe.prototype.getMasksForQuery = function (query, errors) {
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
        const plan = new ExpressionPlan(this, query.ast);
        let masks, filterFunc;
        if (query.ast === undefined) {
            filterFunc = this.filterFuncForQueryObject(query);
            masks = this.getAttributeMask(type, attribute, filterFunc, basedOnCurrentDataframe);
        } else if (plan.isRedundant()) {
            type = plan.rootNode.iterationType();
            const normalizedAttribute = this.normalizeAttributeName(_.keys(plan.rootNode.identifierNodes())[0], type);
            if (normalizedAttribute !== undefined) {
                attribute = normalizedAttribute.attribute;
            }
            _.defaults(query, {attribute: attribute, type: type});
            filterFunc = this.filterFuncForQueryObject(query);
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
        errors.push(e.message);
    }
};

/**
 * @param {ClientQuery} query
 * @returns Function<Object>
 */
Dataframe.prototype.filterFuncForQueryObject = function (query) {
    let filterFunc = _.identity;

    let ast = query.ast;
    if (ast !== undefined) {
        const generator = new ExpressionCodeGenerator('javascript');
        const columnName = this.normalizeAttributeName(query.attribute, query.type);
        if (columnName === undefined) {
            // Trust that this is still single-attribute. Doubtful idea.
            const plan = new ExpressionPlan(this, ast);
            plan.compile();
            filterFunc = plan.rootNode.executor;
        } else {
            ast = generator.transformASTForNullGuards(ast, {value: columnName}, this);
            filterFunc = generator.functionForAST(ast, {'*': 'value'});
        }
        // Maintained only for earlier range queries from histograms, may drop soon:
    } else if (query.start !== undefined && query.stop !== undefined) {
        // Range:
        filterFunc = function (val) {
            return val >= query.start && val < query.stop;
        };

    } else if (query.equals !== undefined) {
        // Exact match or list-contains:
        const compareValue = query.equals;
        if (_.isArray(compareValue)) {
            filterFunc = function (val) {
                return _.contains(compareValue, val);
            };
        } else {
            filterFunc = function (val) {
                return compareValue === val;
            };
        }
    }
    return filterFunc;
};


/**
 * @param {Array} attributeValues
 * @param {Function<Object>} filterFunc
 * @returns Mask
 */
Dataframe.prototype.getMaskForPredicateOnAttributeValues = function (attributeValues, filterFunc) {
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
Dataframe.prototype.getAttributeMask = function (type, columnName, filterFunc, basedOnCurrentDataframe) {
    switch (type) {
        case 'point': {
            const pointMask = this.getPointAttributeMask(columnName, filterFunc, basedOnCurrentDataframe);
            return new DataframeMask(
                this,
                pointMask,
                undefined
            );
        }
        case 'edge': {
            const edgeMask = this.getEdgeAttributeMask(columnName, filterFunc, basedOnCurrentDataframe);
            return new DataframeMask(
                this,
                undefined,
                edgeMask
            );
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
Dataframe.prototype.getEdgeAttributeMask = function (columnName, filterFunc, basedOnCurrentDataframe) {
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
Dataframe.prototype.getPointAttributeMask = function (columnName, filterFunc, basedOnCurrentDataframe) {
    const attr = this.rawdata.attributes.point[columnName];
    if (attr === undefined) {
        return this.fullDataframeMask();
    }

    const values = basedOnCurrentDataframe ? this.getColumnValues(columnName, 'point') : attr.values;
    return this.getMaskForPredicateOnAttributeValues(values, filterFunc);
};


Dataframe.prototype.initializeTypedArrayCache = function (oldNumPoints, oldNumEdges) {
    this.typedArrayCache.filteredEdges = new Uint32Array(oldNumEdges * 2);
    this.typedArrayCache.unsortedEdgeMask = new Uint32Array(oldNumEdges);
    this.typedArrayCache.edgesFlipped = new Uint32Array(oldNumEdges * 2);

    this.typedArrayCache.newPointSizes = new Uint8Array(oldNumPoints);
    this.typedArrayCache.newPointColors = new Uint32Array(oldNumPoints);
    this.typedArrayCache.newEdgeColors = new Uint32Array(oldNumEdges * 2);
    this.typedArrayCache.newEdgeHeights = new Uint32Array(oldNumEdges * 2);
    const numRenderedSplits = this.rawdata.numElements.renderedSplits;
    const numMidEdgeColorsPerEdge = 2 * (numRenderedSplits + 1);
    const numMidEdgeColors = numMidEdgeColorsPerEdge * oldNumEdges;
    this.typedArrayCache.newMidEdgeColors = new Uint32Array(numMidEdgeColors);

    this.typedArrayCache.tempPrevForces = new Float32Array(oldNumPoints * 2);
    this.typedArrayCache.tempDegrees = new Uint32Array(oldNumPoints);
    this.typedArrayCache.tempSpringsPos = new Float32Array(oldNumEdges * 4);
    this.typedArrayCache.tempCurPoints = new Float32Array(oldNumPoints * 2);

    this.typedArrayCache.newPrevForces = new Float32Array(oldNumPoints * 2);
    this.typedArrayCache.newDegrees = new Uint32Array(oldNumPoints);
    this.typedArrayCache.newSpringsPos = new Float32Array(oldNumEdges * 4);
    this.typedArrayCache.newCurPoints = new Float32Array(oldNumPoints * 2);
};

/**
 * Filters this.data in-place given masks. Does not modify this.rawdata.
 * TODO: Take in Set objects, not just Mask.
 * @param {DataframeMask} masks
 * @param {SimCL} simulator
 * @returns {Promise.<Array<Buffer>>} updated arrays - false if no-op
 */
Dataframe.prototype.applyDataframeMaskToFilterInPlace = function (masks, simulator) {
    logger.debug('Starting Filtering Data In-Place by DataframeMask');

    if (masks === this.lastMasks) {
        return Q(false);
    }

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
    const filteredEdges = new Uint32Array(this.typedArrayCache.filteredEdges.buffer, 0, numEdges * 2);
    const originalEdges = rawdata.hostBuffers.unsortedEdges;

    // We start unsorted because we're working with the rawdata first.
    const unsortedEdgeMask = new Uint32Array(this.typedArrayCache.unsortedEdgeMask.buffer, 0, numEdges);

    masks.mapEdgeIndexes((edgeIndex, i) => {
        unsortedEdgeMask[i] = edgeIndex;
    });

    // TODO: See if there's a way to do this without sorting.
    // Sorting is slow as all hell.
    // Array.prototype.sort.call(unsortedEdgeMask, (a, b) => {
    //     return a - b;
    // });

    const unsortedMasks = masks;

    // const unsortedMasks = new DataframeMask(
    //     this,
    //     masks.point,
    //     unsortedEdgeMask
    // );

    const pointOriginalLookup = [];
    masks.mapPointIndexes((pointIndex, i) => {
        pointOriginalLookup[pointIndex] = i;
    });

    _.each(unsortedEdgeMask, (oldIdx, i) => {
        filteredEdges[i*2] = pointOriginalLookup[originalEdges[oldIdx*2]];
        filteredEdges[i*2 + 1] = pointOriginalLookup[originalEdges[oldIdx*2 + 1]];
    });

    const edgesFlipped = new Uint32Array(this.typedArrayCache.edgesFlipped.buffer, 0, filteredEdges.length);

    for (let i = 0; i < filteredEdges.length/2; i++) {
        edgesFlipped[2 * i] = filteredEdges[2 * i + 1];
        edgesFlipped[2 * i + 1] = filteredEdges[2 * i];
    }

    newData.hostBuffers.unsortedEdges = filteredEdges;
    const forwardsEdges = this.encapsulateEdges(filteredEdges, numPoints, rawdata.hostBuffers.forwardsEdges, unsortedMasks, pointOriginalLookup);
    const backwardsEdges = this.encapsulateEdges(edgesFlipped, numPoints, rawdata.hostBuffers.backwardsEdges, unsortedMasks, pointOriginalLookup);
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
    const numMidEdgeColorsPerEdge = 2 * (numRenderedSplits + 1);
    const numMidEdgeColors = numMidEdgeColorsPerEdge * numEdges;
    const newMidEdgeColors = new Uint32Array(this.typedArrayCache.newMidEdgeColors.buffer, 0, numMidEdgeColors);

    masks.mapEdgeIndexes((edgeIndex, i) => {

        for (let j = 0; j < numMidEdgeColorsPerEdge; j++) {
            newMidEdgeColors[i * numMidEdgeColorsPerEdge + j] =
                rawdata.localBuffers.midEdgeColors[edgeIndex * numMidEdgeColorsPerEdge + j];
        }

    });

    newData.localBuffers.midEdgeColors = newMidEdgeColors;

    // numElements;
    // Copy all old in.
    _.each(_.keys(rawdata.numElements), (key) => {
        newData.numElements[key] = rawdata.numElements[key];
    });
    // Update point/edge counts, since those were filtered,
    // along with forwardsWorkItems/backwardsWorkItems.
    newData.numElements.point = masks.numPoints();
    newData.numElements.edge = masks.numEdges();
    newData.numElements.forwardsWorkItems = newData.hostBuffers.forwardsEdges.workItemsTyped.length / 4;
    newData.numElements.backwardsWorkItems = newData.hostBuffers.backwardsEdges.workItemsTyped.length / 4;
    // TODO: NumMidPoints and MidEdges

    ///////////////////////////////////////////////////////////////////////////
    // Copy Buffer Overlays
    ///////////////////////////////////////////////////////////////////////////

    _.each(this.bufferOverlays, (val/*, key*/) => {
        const alias = val.alias;
        const type = val.type;
        const originalName = val.originalName;

        const newBuffer = this.getLocalBuffer(originalName).constructor(masks.maskSize()[type]);
        const rawBuffer = this.rawdata.localBuffers[alias];

        masks.mapIndexes(type, (rawIndex, i) => {
            newBuffer[i] = rawBuffer[rawIndex];
        });

        newData.localBuffers[alias] = newBuffer;
    });

    //////////////////////////////////
    // SIMULATOR BUFFERS.
    //////////////////////////////////

    const tempPrevForces = new Float32Array(this.typedArrayCache.tempPrevForces.buffer, 0, oldNumPoints * 2);
    const tempSpringsPos = new Float32Array(this.typedArrayCache.tempSpringsPos.buffer, 0, oldNumEdges * 4);
    const tempCurPoints = new Float32Array(this.typedArrayCache.tempCurPoints.buffer, 0, oldNumPoints * 2);

    const newPrevForces = new Float32Array(this.typedArrayCache.newPrevForces.buffer, 0, numPoints * 2);
    const newDegrees = new Uint32Array(this.typedArrayCache.newDegrees.buffer, 0, numPoints);
    const newSpringsPos = new Float32Array(this.typedArrayCache.newSpringsPos.buffer, 0, numEdges * 4);
    const newCurPoints = new Float32Array(this.typedArrayCache.newCurPoints.buffer, 0, numPoints * 2);

    const filteredSimBuffers = this.data.buffers.simulator;

    return Q.all([
        rawSimBuffers.prevForces.read(tempPrevForces),
        rawSimBuffers.springsPos.read(tempSpringsPos),
        filteredSimBuffers.curPoints.read(tempCurPoints)
    ]).spread(() => {

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

            promise = simulator.renderer.createBuffer(this.lastPointPositions, 'curPointsFiltered')
                .then((pointVBO) => {
                    return simulator.cl.createBufferGL(pointVBO, 'curPointsFiltered');
                }).then((pointBuf) => {
                    this.filteredBufferCache.simulator.curPoints = pointBuf;
                });

        } else {
            this.lastMasks.mapPointIndexes((pointIndex, i) => {
                this.lastPointPositions[pointIndex*2] = tempCurPoints[i*2];
                this.lastPointPositions[pointIndex*2 + 1] = tempCurPoints[i*2 + 1];
            });

            promise = Q({});
        }

        return promise;

    }).then(() => {
        masks.mapPointIndexes((oldPointIndex, i) => {
            newPrevForces[i*2] = tempPrevForces[oldPointIndex*2];
            newPrevForces[i*2 + 1] = tempPrevForces[oldPointIndex*2 + 1];

            newDegrees[i] = forwardsEdges.degreesTyped[i] + backwardsEdges.degreesTyped[i];

            newCurPoints[i*2] = this.lastPointPositions[oldPointIndex*2];
            newCurPoints[i*2 + 1] = this.lastPointPositions[oldPointIndex*2 + 1];
        });

        masks.mapEdgeIndexes((oldEdgeIdx, i) => {
            newSpringsPos[i*4] = tempSpringsPos[oldEdgeIdx*4];
            newSpringsPos[i*4 + 1] = tempSpringsPos[oldEdgeIdx*4 + 1];
            newSpringsPos[i*4 + 2] = tempSpringsPos[oldEdgeIdx*4 + 2];
            newSpringsPos[i*4 + 3] = tempSpringsPos[oldEdgeIdx*4 + 3];
        });

        const someBufferPropertyNames = ['curPoints', 'prevForces', 'degrees', 'forwardsEdges', 'forwardsDegrees',
            'forwardsWorkItems', 'forwardsEdgeStartEndIdxs', 'backwardsEdges',
            'backwardsDegrees', 'backwardsWorkItems', 'backwardsEdgeStartEndIdxs',
            'springsPos'
        ];
        _.each(someBufferPropertyNames, (key) => {
            newData.buffers.simulator[key] = this.filteredBufferCache.simulator[key];
        });

        const newBuffers = newData.buffers.simulator;
        return Q.all([
            newBuffers.curPoints.write(newCurPoints),
            newBuffers.prevForces.write(newPrevForces),
            newBuffers.degrees.write(newDegrees),
            newBuffers.springsPos.write(newSpringsPos),
            newBuffers.forwardsEdges.write(forwardsEdges.edgesTyped),
            newBuffers.forwardsDegrees.write(forwardsEdges.degreesTyped),
            newBuffers.forwardsWorkItems.write(forwardsEdges.workItemsTyped),
            newBuffers.forwardsEdgeStartEndIdxs.write(forwardsEdges.edgeStartEndIdxsTyped),
            newBuffers.backwardsEdges.write(backwardsEdges.edgesTyped),
            newBuffers.backwardsDegrees.write(backwardsEdges.degreesTyped),
            newBuffers.backwardsWorkItems.write(backwardsEdges.workItemsTyped),
            newBuffers.backwardsEdgeStartEndIdxs.write(backwardsEdges.edgeStartEndIdxsTyped)
        ]);


    }).then(() => {
        // Delete all GPU buffers for values.
        const promises = [];
        _.each(GraphComponentTypes, (type) => {
            const buffers = this.data.buffers[type];
            _.each(_.keys(buffers), (name) => {
                //const buf = buffers[name];
                promises.push(buffers.delete);
                delete buffers[name];
            });
        });

        return Q.all(promises);

    }).then(() => {

        // Just in case, copy over references from raw data to newData
        // This means we don't have to explicitly overwrite everything.

        _.each(_.keys(rawdata.buffers.simulator), (key) => {
            if (newData.buffers.simulator[key] === undefined) {
                newData.buffers.simulator[key] = rawdata.buffers.simulator[key];
            }
        });

        _.each(_.keys(rawdata.localBuffers), (key) => {
            if (newData.localBuffers[key] === undefined) {
                newData.localBuffers[key] = rawdata.localBuffers[key];
            }
        });

        _.each(_.keys(rawdata.numElements), (key) => {
            if (newData.numElements[key] === undefined) {
                newData.numElements[key] = rawdata.numElements[key];
            }
        });

        _.each(_.keys(rawdata.rendererBuffers), (key) => {
            if (newData.rendererBuffers[key] === undefined) {
                newData.rendererBuffers[key] = rawdata.rendererBuffers[key];
            }
        });

        _.each(_.keys(rawdata.hostBuffers), (key) => {
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
        _.each(_.keys(simulator.versions.buffers), (key) => {
            simulator.versions.buffers[key] += 1;
        });
        simulator.versions.tick++;

        this.lastMasks.point = unsortedMasks.point;
        this.lastMasks.edge = unsortedMasks.edge;

    }).then(() => {
        logger.debug('Filter Completed in ' + (Date.now() - start) + ' ms.');
        this.data = newData;
    });

};


//////////////////////////////////////////////////////////////////////////////
// Data Loading
//////////////////////////////////////////////////////////////////////////////

const SystemAttributeNames = [
    'pointColor', 'pointSize', 'pointTitle', 'pointLabel',
    'edgeLabel', 'edgeTitle', 'edgeHeight',
    'degree'
];

Dataframe.prototype.loadComputedColumnManager = function (computedColumnManager) {
    this.computedColumnManager = computedColumnManager;

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
                arrType: colDesc.arrType
            };

            attrs[colType][name] = col;
        });

    });

};


Dataframe.prototype.registerNewComputedColumn = function (computedColumnManager, columnType, columnName) {
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
        arrType: colDesc.arrType
    };

    attrs[columnType][columnName] = col;
};


/**
 * TODO: Implicit degrees for points and src/dst for edges.
 * @param {Object.<AttrObject>} attributeObjectsByName
 * @param {string} type - any of [TYPES]{@link BufferTypeKeys}
 * @param {Number} numElements - prescribe or describe? number present by type.
 */
Dataframe.prototype.loadAttributesForType = function (attributeObjectsByName, type, numElements) {

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
        .filter((name) => {
            return SystemAttributeNames.indexOf(name) === -1;
        })
        .filter((name) => { return name !== nodeTitleField && name !== edgeTitleField; });

    const userDefinedAttributesByName = _.pick(attributeObjectsByName, (value, key) => {
        return userDefinedAttributeKeys.indexOf(key) > -1;
    });

    this.rawdata.numElements[type] = numElements;

    if (nodeTitleField) {
        userDefinedAttributesByName._title = attributeObjectsByName[nodeTitleField];
    } else if (edgeTitleField) {
        userDefinedAttributesByName._title = attributeObjectsByName[edgeTitleField];
    } else {
        userDefinedAttributesByName._title = {type: 'number', name: 'label', values: _.range(numElements)};
    }

    // Mark version as 0, and that they're not dirty.
    _.each(userDefinedAttributesByName, (obj, key) => {
        obj.version = 0;
        obj.dirty = false;
        obj.numberPerGraphComponent = obj.numberPerGraphComponent || 1;
    });

    _.extend(this.rawdata.attributes[type], userDefinedAttributesByName);
    // TODO: Case where data != raw data.
};


Dataframe.prototype.loadColumn = function (name, type, valueObj) {
    valueObj.version = 0;
    valueObj.dirty = false;
    valueObj.numberPerGraphComponent = valueObj.numberPerGraphComponent || 1;

    this.rawdata.attributes[type][name] = valueObj;
};


Dataframe.prototype.defineAttributeOn = function (attributes, name, dataType, values, keyName=undefined) {
    const result = {
        name: name,
        type: dataType,
        values: values,
        version: 0,
        dirty: false,
        numberPerGraphComponent: 1
    };
    attributes[keyName || name] = result;
    return result;
};


/** Load in degrees as a universal (independent of data source) value
 * @param {Uint32Array} outDegrees - degrees going out of nodes
 * @param {Uint32Array} inDegrees - degrees going into nodes
 */
Dataframe.prototype.loadDegrees = function (outDegrees, inDegrees) {
    const numElements = this.numPoints();
    let attributes = this.rawdata.attributes.point;

    // TODO: Error handling
    if (numElements !== outDegrees.length || numElements !== inDegrees.length) {
        return;
    }

    let degree = new Array(numElements);
    let degreeIn = new Array(numElements);
    let degreeOut = new Array(numElements);

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
Dataframe.prototype.loadEdgeDestinations = function (unsortedEdges) {
    const n = unsortedEdges.length;
    const numElements = this.numEdges() || n / 2;
    let attributes = this.rawdata.attributes.edge;
    const nodeTitles = this.rawdata.attributes.point._title.values;

    let source = new Array(numElements);
    let destination = new Array(numElements);

    for (let i = 0; i < numElements; i++) {
        source[i] = nodeTitles[unsortedEdges[i*2]];
        destination[i] = nodeTitles[unsortedEdges[i*2 + 1]];
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
Dataframe.prototype.loadBuffer = function (name, type, buffer) {
    const buffers = this.rawdata.buffers[type];
    buffers[name] = buffer;
};

Dataframe.prototype.writeBuffer = function (name, type, values, simulator) {
    const byteLength = values.byteLength;
    const buffer = this.rawdata.buffers[type][name];

    // If it's written to directly, we assume we want to also
    // have a buffer to write to during filters.
    return simulator.cl.createBuffer(byteLength, name+'Filtered')
        .then((filteredBuffer) => {
            this.filteredBufferCache.simulator[name] = filteredBuffer;
            return buffer.write(values);
        });
};


/** Load in a host buffer object.
 *  @param {string} name - name of the buffer
 *  @param {Object} buffer - a raw OpenCL buffer object
 */
Dataframe.prototype.loadHostBuffer = function (name, buffer) {
    const hostBuffers = this.rawdata.hostBuffers;
    hostBuffers[name] = buffer;
};


Dataframe.prototype.loadLocalBuffer = function (name, buffer) {
    const localBuffers = this.rawdata.localBuffers;
    localBuffers[name] = buffer;
};


Dataframe.prototype.setLocalBufferValue = function (name, idx, value) {
    const localBuffers = this.rawdata.localBuffers;
    localBuffers[name][idx] = value;
};


Dataframe.prototype.loadRendererBuffer = function (name, buffer) {
    const rendererBuffers = this.rawdata.rendererBuffers;
    rendererBuffers[name] = buffer;
};


Dataframe.prototype.setHostBufferValue = function (name, idx, value) {
    const hostBuffers = this.rawdata.hostBuffers;
    hostBuffers[name][idx] = value;
};


Dataframe.prototype.loadLabels = function (type, labels) {
    this.rawdata.labels[type] = labels;
};


Dataframe.prototype.deleteBuffer = function (name) {
    _.each(BufferTypeKeys, (type) => {
        _.each(_.keys(this.rawdata.buffers[type]), (key) => {
            if (key === name) {
                this.rawdata.buffers[type][key].delete();
                this.rawdata.buffers[type][key] = null;
            }
        });
    });
};

Dataframe.prototype.setNumElements = function (type, num) {
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
Dataframe.prototype.normalizeAttributeName = function (columnName, type) {
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
Dataframe.prototype.getKeyFromName = function (maybeName, type) {
    // TODO: Maintain an actual lookup instead of iterating through.

    if (type === undefined) {
        return this.getKeyFromName(maybeName, 'point') || this.getKeyFromName(maybeName, 'edge');
    }

    const attributes = this.rawdata.attributes[type];
    const matchKeys = _.filter(_.keys(attributes), (key) => {
        return attributes[key].name === maybeName || key === maybeName;
    });

    if (matchKeys.length > 1) {
        logger.info('The name ' + type + ':' + maybeName + ' is ambiguous, the following matches: ' + matchKeys.length);
    }

    if (matchKeys.length > 0) {
        return {attribute: matchKeys[0], type: type};
    }

    if (this.data.attributes[type][maybeName] !== undefined) {
        return {attribute: maybeName, type: type};
    }

    return undefined;
};

Dataframe.prototype.getBufferKeys = function (type) {
    return _.sortBy(
        _.keys(this.data.buffers[type]),
        _.identity
    );
};

Dataframe.prototype.getOriginalNumElements = function (type) {
    const res = this.rawdata.numElements[type];
    if (!res && res !== 0) {
        throw new Error('Invalid Num Elements: ' + type);
    }
    return res;
};

Dataframe.prototype.getNumElements = function (type) {
    const res = this.data.numElements[type];
    if (!res && res !== 0) {
        throw new Error('Invalid Num Elements: ' + type);
    }
    return res;
};

Dataframe.prototype.getAllBuffers = function (type) {
    return this.data.buffers[type];
};

/// Buffer reset capability, specific to local buffers for now to make highlight work:

Dataframe.prototype.overlayLocalBuffer = function (type, name, alias, values) {
    if (values) {
        // Use getLocalBuffer to match its constructor, does not care about contents.
        const newUnfilteredBuffer = this.getLocalBuffer(name).constructor(values.length);
        for (let i=0; i< values.length; i++) {
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
        this.lastMasks.mapIndexes(type, (indexInRaw, i) => {
            newFilteredBuffer[i] = newUnfilteredBuffer[indexInRaw];
        });

        this.data.localBuffers[alias] = newFilteredBuffer;
    }
    if (this.hasLocalBuffer(name) && this.hasLocalBuffer(alias)) {
        this.bufferOverlays[name] = {type: type, alias: alias, originalName: name};
    } else {
        throw new Error('Invalid overlay of ' + name + ' to ' + alias);
    }
};

Dataframe.prototype.canResetLocalBuffer = function (name) {
    return this.bufferOverlays[name] !== undefined;
};

Dataframe.prototype.resetLocalBuffer = function (name) {
    if (this.canResetLocalBuffer(name)) {
        delete this.bufferOverlays[name];
    }
};

Dataframe.prototype.hasLocalBuffer = function (name) {
    const hasDeprecatedExplicitLocalBuffer = this.data.localBuffers[name] !== undefined ||
        this.rawdata.localBuffers[name] !== undefined;
    const hasComputedLocalBuffer = this.computedColumnManager.hasColumn('localBuffer', name);
    return (hasDeprecatedExplicitLocalBuffer || hasComputedLocalBuffer);
};

Dataframe.prototype.getLocalBuffer = function (name, unfiltered) {

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
    const res = this.getColumnValues(name, 'localBuffer');

    if (!res) {
        throw new Error('Invalid Local Buffer: ' + name);
    }

    return res;
};

Dataframe.prototype.getHostBuffer = function (name) {

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

Dataframe.prototype.hasHostBuffer = function (name) {
    const hasDeprecatedExplicitHostBuffer = this.data.hostBuffers[name] !== undefined ||
        this.rawdata.hostBuffers[name] !== undefined;
    const hasComputedHostBuffer = this.computedColumnManager.hasColumn('hostBuffer', name);
    return (hasDeprecatedExplicitHostBuffer || hasComputedHostBuffer);

};

Dataframe.prototype.getLabels = function (type) {
    return this.data.labels[type];
};


/** Returns an OpenCL buffer object.
 *  @param {string} name - name of the buffer
 *  @param {string} type - any of [TYPES]{@link BufferTypeKeys}.
 */
Dataframe.prototype.getBuffer = function (name, type) {
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
            throw new Error('Attempting to get buffer that is non-numeric; data type is: ' + dataType);
        }

        const typedData = new Float32Array(data);
        const byteLength = typedData.byteLength;

        return this.simulator.cl.createBuffer(byteLength, '_' + type + '_' + name)
            .then((newBuffer) => {
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

Dataframe.prototype.getVersion = function (type, attrName) {
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
Dataframe.prototype.getCell = function (index, type, attrName) {

    const attributes = this.data.attributes[type];
    const numberPerGraphComponent = attributes[attrName].numberPerGraphComponent;

    // TODO FIXME HACK:
    // So computed column manager can work, we need to pass through calls from here
    // to getHostBuffer.

    if (type === 'hostBuffer' && (!attributes || !attributes[attrName])) {
        return this.getHostBuffer(attrName)[index];
    }

    if (type === 'localBuffer' && (!attributes || !attributes[attrName])) {
        return this.getLocalBuffer(attrName)[index];
    }



    // First try to see if have values already calculated / cached for this frame

    // Check to see if it's computed and version matches that of computed column.
    // Computed column versions reflect dependencies between computed columns.
    const computedVersionMatches = !(attributes[attrName].computed &&
        (attributes[attrName].computedVersion !== this.computedColumnManager.getColumnVersion(type, attrName))
    );

    if (computedVersionMatches && !attributes[attrName].dirty && attributes[attrName].values) {

        // TODO: Deduplicate this code from dataframe and computed column manager
        if (numberPerGraphComponent === 1) {
            return attributes[attrName].values[index];
        } else {
            const ArrayVariant = attributes[attrName].arrType || Array;
            const returnArr = new ArrayVariant(numberPerGraphComponent);
            for (let j = 0; j < returnArr.length; j++) {
                returnArr[j] = attributes[attrName].values[index*numberPerGraphComponent + j];
            }
            return returnArr;
        }
    }

    // If it's calculated and needs to be recomputed
    if (attributes[attrName].computed && (!computedVersionMatches || attributes[attrName].dirty)) {
        return this.computedColumnManager.getValue(this, type, attrName, index);
    }

    // If it's not calculated / cached, and filtered use last masks (parent) to index into already
    // calculated values
    if (attributes[attrName].dirty && attributes[attrName].dirty.cause === 'filter') {
        const parentIndex = this.lastMasks.getIndexByType(type, index);
        return this.rawdata.attributes[type][attrName].values[parentIndex];
        if (numberPerGraphComponent === 1) {
            return this.rawdata.attributes[type][attrName].values[parentIndex];
        } else {
            const ArrayVariant = attributes[attrName].arrType || Array;
            const returnArr = new ArrayVariant(numberPerGraphComponent);
            for (let j = 0; j < returnArr.length; j++) {
                returnArr[j] = this.rawdata.attributes[attrName].values[parentIndex*numberPerGraphComponent + j];
            }
            return returnArr;
        }
    }

    // Nothing was found, so throw error.
    throw new Error("Couldn't get cell value for: " + attrName + ' ' + index);
};


/** Returns one row object.
 * @param {double} index - which element to extract.
 * @param {string} type - any of [TYPES]{@link BufferTypeKeys}.
 */
Dataframe.prototype.getRowAt = function (index, type) {
    const origIndex = index; // For client-side metadata

    const row = {};
    _.each(_.keys(this.data.attributes[type]), (key) => {
        // Skip columns that are prepended with __
        if (key[0] === '_' && key[1] === '_') {
            return;
        }

        row[key] = this.getCell(index, type, key);
    });
    row._index = origIndex;
    return row;
};


/** Returns array of row (fat json) objects.
 * @param {Array.<number>} indices - which elements to extract.
 * @param {string} type - any of [TYPES]{@link BufferTypeKeys}.
 */
Dataframe.prototype.getRows = function (indices, type) {

    indices = indices || _.range(this.data.numElements[type]);

    return _.map(indices, (index) => {
        return this.getRowAt(index, type);
    });
};


/** Returns a descriptor of a set of rows.
 * This works relative to UNSORTED edge orders, since it's meant
 * for serializing raw data.
 * @param {Array.<number>} indices - which elements to extract.
 * @param {string} type - any of [TYPES]{@link BufferTypeKeys}.
 * @returns {{header, values}}
 */
Dataframe.prototype.getRowsCompactUnfiltered = function (indices, type) {

    // TODO: Should this be generalized for non-serializing purposes? E.g., it's not in
    // the standard lookup path.
    const attributes = this.rawdata.attributes[type],
        keys = this.getAttributeKeys(type);

    indices = indices || _.range(this.data.numElements[type]);

    const lastMasks = this.lastMasks;

    const values = _.map(indices, (index) => {
        index = lastMasks.getIndexByType(type, index);
        const row = [];
        _.each(keys, (key) => {
            const value = attributes[key].values[index];
            // This is serialization-specific logic to avoid unusable CSV output. Hoist as necessary:
            if (dataTypeUtil.valueSignifiesUndefined(value)) {
                row.push(NaN);
            }
            row.push(value);
        });
        return row;
    });

    return {
        header: keys,
        values: values
    };
};

/** Answers the type for the column name and type (point/edge). */
Dataframe.prototype.getDataType = function (columnName, type) {
    // Assumes that types don't change after filtering
    return this.rawdata.attributes[type][columnName] && this.rawdata.attributes[type][columnName].type;
};


Dataframe.prototype.getColumn = function (columnName, type) {
    return _.omit(this.rawdata.attributes[type][columnName], LargeColumnProperties);
};

const LargeColumnProperties = ['values', 'aggregations'];

/**
 * @typedef {Object} Column
 * @property {Array} values
 * @property {String} type
 * @property {Object} target
 */

Dataframe.prototype.reIndexArray = function (columnName, type, arr, indexType, attributeDesc) {
    if (!indexType) {
        return arr;
    }

    // Return an array indexed/sorted on the sorted array indexing.
    // TODO: Kill this
    if (indexType === 'sortedEdge') {
        return arr;
    }

    // Nothing was found, so throw error.
    throw new Error('Attempted to reindex array with invalid index type: ', columnName, type, indexType);
};


// TODO: Have this return edge attributes in sorted order, unless
// explicitly requested to be unsorted (for internal performance reasons)
Dataframe.prototype.getColumnValues = function (columnName, type) {

    const attributes = this.data.attributes[type];

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

    // This lets us know if we need to reindex the values,
    // e.g., go from unsorted to sorted.
    const indexType = attributes[columnName].index;


    // First try to see if have values already calculated / cached for this frame

    // Check to see if it's computed and version matches that of computed column.
    // Computed column versions reflect dependencies between computed columns.
    const computedVersionMatches = !(attributes[columnName].computed &&
        (attributes[columnName].computedVersion !== this.computedColumnManager.getColumnVersion(type, columnName))
    );

    if (computedVersionMatches && !attributes[columnName].dirty && attributes[columnName].values) {
        return this.reIndexArray(columnName, type, attributes[columnName].values, indexType, attributes[columnName]);
    }

    // If it's calculated and needs to be recomputed
    if (attributes[columnName].computed && (!computedVersionMatches || attributes[columnName].dirty)) {

        const newValues = this.computedColumnManager.getDenseMaterializedArray(this, type, columnName);
        attributes[columnName].values = newValues;
        attributes[columnName].dirty = false;

        return this.reIndexArray(columnName, type, newValues, indexType, attributes[columnName]);
    }


    // If it's not calculated / cached, and filtered, apply the mask and compact
    // then cache the result.
    if (attributes[columnName].dirty && attributes[columnName].dirty.cause === 'filter') {

        const rawAttributes = this.rawdata.attributes[type];
        const ArrayVariant = rawAttributes[columnName].arrType || Array;
        const numNewValues = this.lastMasks.numByType(type);
        const numberPerGraphComponent = rawAttributes[columnName].numberPerGraphComponent;
        const newValues = new ArrayVariant(numberPerGraphComponent * numNewValues);

        this.lastMasks.mapIndexes(type, (idx, i) => {
            for (let j = 0; j < numberPerGraphComponent; j++) {
                newValues[numberPerGraphComponent*i + j] = rawAttributes[columnName].values[numberPerGraphComponent*idx + j];
            }
            // newValues.push(rawAttributes[columnName].values[idx]);
        });

        attributes[columnName].values = newValues;
        attributes[columnName].dirty = false;

        return this.reIndexArray(columnName, type, newValues, indexType, attributes[columnName]);
    }

    // Nothing was found, so throw error.
    throw new Error("Couldn't get column values for: " + columnName);
};


// TODO: Track modifications to underlying GPU buffer,
// so we can flag them as dirty='CL' or something and know to copy off GPU.
Dataframe.prototype.getClBuffer = function (cl, columnName, type) {

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
    const computedVersionMatches = !(attributes[columnName].computed &&
        (attributes[columnName].computedVersion !== this.computedColumnManager.getColumnVersion(type, columnName))
    );

    if (computedVersionMatches && !attributes[columnName].dirty && attributes[columnName].clBuffer) {
        return Q(attributes[columnName].clBuffer);
    }

    // Need to fix CL Buffer. Today, naively get all columns and do a full copy.
    // In the future, do this more cleverly (e.g., GPU filter + compact)

    const newValues = this.getColumnValues(columnName, type);

    // TODO: Add eviction to generic CL Buffer caching.
    return this.getCachedCLBuffer(cl, columnName, type)
        .then((buffer) => {
            return buffer.write(newValues);
        }).then((buffer) => {
            attributes[columnName].clBuffer = buffer;
            return buffer;
        });
};


// TODO: Add eviction to generic CL Buffer caching.
Dataframe.prototype.getCachedCLBuffer = function (cl, columnName, type) {
    const desc = this.data.attributes[type][columnName];
    const arrType = desc.arrType;

    if (arrType === Array) {
        throw new Error('Attempted to make CL Buffer for non-typed array: ', columnName, type);
    }

    const graphComponentType = desc.graphComponentType || type;
    const numElements = this.getNumElements(graphComponentType);

    this.clBufferCache[type] = this.clBufferCache[type] || {};
    const cache = this.clBufferCache[type];

    // TODO: Deal with size not being sufficient.
    if (cache[columnName]) {

        if (cache[columnName].size < arrType.BYTES_PER_ELEMENT * numElements) {
            // TODO: Evict from cache and do necessary GC
            throw new Error('Did not implement resizing of cached CL buffers yet for: ', columnName, type);
        }

        return Q(cache[columnName]);
    }

    // Not cached, so create and cache
    return cl.createBuffer(numElements * arrType.BYTES_PER_ELEMENT, 'clBuffer_' + type + '_' + columnName)
        .then((buffer) => {
            cache[columnName] = buffer;
            return buffer;
        });
};

/** @typedef {Object} ValueCount
 * @property {Object} distinctValue
 * @property {Number} count
 */


/**
 * @typedef {Object} Aggregations
 * @property {String} dataType
 * @property {String} jsType
 * @property {Boolean} isNumeric
 * @property {Boolean} isIntegral
 * @property {Boolean} isContinuous
 * @property {Boolean} isCategorical
 * @property {Boolean} isQuantitative
 * @property {Boolean} isOrdered
 * @property {Boolean} isDiverging
 * @property {Boolean} hasPositive
 * @property {Boolean} hasNegative
 * @property {Boolean} isPositive Has positive values and no negative ones.
 * @property {Number} count
 * @property {Number} countDistinct
 * @property {ValueCount[]} distinctValues count of instances by value, sorted by count descending.
 * @property {Object} maxValue
 * @property {Object} minValue
 * @property {Number} standardDeviation
 * @property {Number} averageValue
 * @property {Number} sum
 * @property {Object} binning
 */


Dataframe.prototype.metadataForColumn = function (columnName, type) {
    let metadata, defs, defsContainer;
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
    defs = _.find(defsContainer, (eachDefs) => { return eachDefs[columnName] !== undefined; });
    if (defs !== undefined) {
        metadata = defs[columnName];
    }
    return metadata;
};


/**
 * @returns {ColumnAggregation}
 */
Dataframe.prototype.getColumnAggregations = function(columnName, type, unfiltered) {
    const dataframeData = (unfiltered ? this.rawdata : this.data);
    const column = dataframeData.attributes[type][columnName];
    if (column === undefined) { return undefined; }
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
Dataframe.prototype.doesColumnRepresentColorPaletteMap = function (type, columnName) {
    const aggregations = this.getColumnAggregations(columnName, type, true);
    const aggType = 'fitsColorPaletteMap';
    if (!aggregations.hasAggregationByType(aggType)) {
        let fits = false;
        if (this.getDataType(columnName, type) === 'color' &&
            aggregations.getAggregationByType('dataType') === 'integer') {
            let distinctValues = _.map(aggregations.getAggregationByType('distinctValues'), (x) => x.distinctValue);
            if (_.isEmpty(distinctValues)) {
                distinctValues = [aggregations.getAggregationByType('minValue'),
                    aggregations.getAggregationByType('maxValue')];
            }
            if (palettes.valuesFitOnePaletteCategory(distinctValues)) {
                fits = true;
            }
        }
        aggregations.updateAggregationTo(aggType, fits);
        return fits;
    }
    return aggregations.getAggregationByType(aggType);
};

Dataframe.prototype.getAttributeKeys = function (type) {
    // Assumes that filtering doesn't add/remove columns
    // TODO: Generalize so that we can add/remove columns
    return _.sortBy(
        _.keys(this.rawdata.attributes[type]),
        _.identity
    );
};


Dataframe.prototype.isAttributeNamePrivate = function (columnName) {
    return columnName[0] === '_'/* && columnName[1] === '_'*/;
};


Dataframe.prototype.getColumnsByType = function () {
    const result = {};
    _.each(GraphComponentTypes, (typeName) => {
        const typeResult = {};
        const columnNamesPerType = this.getAttributeKeys(typeName);
        _.each(columnNamesPerType, (columnName) => {
            const column = this.getColumn(columnName, typeName);
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
 * @param {string} target - filename to write to.
 * @param {Object} options - has flags 'compact' and 'compress'
 */
Dataframe.prototype.serializeRows = function (target, options) {
    // TODO: Async file write.
    options = options || {};
    const toSerialize = {};

    _.each(BufferTypeKeys, (type) => {
        if (options.compact) {
            toSerialize[type] = this.getRowsCompactUnfiltered(undefined, type);
        } else {
            toSerialize[type] = this.getRows(undefined, type);
        }
    });

    serialize(toSerialize, options.compress, target);
};

/** Serialize the dataframe to the target in JSON format in column-wise order.
 * @param {string} target - filename to write to.
 * @param {Object} options - has flags 'compact' and 'compress'
 */
Dataframe.prototype.serializeColumns = function (target, options) {
    options = options || {};
    const toSerialize = {};

    _.each(BufferTypeKeys, (type) => {
        toSerialize[type] = {};
        const keys = this.getAttributeKeys(type);
        _.each(keys, (key) => {
            toSerialize[type][key] = this.getColumnValues(key, type);
        });
    });

    serialize(toSerialize, options.compress, target);
};

/** Return a promise of a string CSV representation of the dataframe
 */
Dataframe.prototype.formatAsCSV = function (type) {
    const compact = this.getRowsCompactUnfiltered(undefined, type);
    const promiseStringify = Q.denodeify(csv.stringify);
    console.log('compact header: ', compact.header);
    const structuredArrays = [compact.header].concat(compact.values);

    return promiseStringify(structuredArrays);

};

//////////////////////////////////////////////////////////////////////////////
// Aggregations and Histograms
//////////////////////////////////////////////////////////////////////////////


// [int] * ?[ string ] * ?{string -> ??} * ?{countBy, ??} * {point, edge, undefined}
// -> ??
//undefined type signifies both nodes and edges
Dataframe.prototype.aggregate = function (indices, attributes, binning, mode, type) {

    const processAgg = (attribute) => {

        const goalNumberOfBins = binning ? binning._goalNumberOfBins : 0;
        const binningHint = binning ? binning[attribute] : undefined;
        const dataType = this.getDataType(attribute, type);

        if (mode !== 'countBy' && dataType !== 'string') {
            return this.histogram(attribute, binningHint, goalNumberOfBins, indices, type, dataType);
        } else {
            return this.countBy(attribute, binningHint, indices, type, dataType);
        }
    };

    const validAttributes = this.getAttributeKeys(type);
    let keysToAggregate = attributes ? attributes : validAttributes;

    // Make sure that valid non-private attributes were passed in.
    keysToAggregate = keysToAggregate.filter(
        (val) => !this.isAttributeNamePrivate(val) && validAttributes.indexOf(val) !== -1);


    let chain = Q(); //simulator.otherKernels.histogramKernel.setIndices(simulator, indices);
    const aggregated = {};

    _.each(keysToAggregate, (attribute) => {

        chain = chain.then(() => {
            return processAgg(attribute, indices)
                .then((agg) => {
                    // Store result
                    aggregated[attribute] = agg;

                    // Force loop restart before handling next
                    // So async IO can go through, e.g., VBO updates
                    const waitForNextTick = Q.defer();
                    process.nextTick(() => {
                        waitForNextTick.resolve();
                    });
                    return waitForNextTick.promise;
                });
        });
    });

    return chain.then(() => aggregated);


    // Array of promises
    // const promisedAggregates = _.map(keysToAggregate, (attribute) => {
    //     return processAgg(attribute, indices);
    // });

    // return Q.all(promisedAggregates).then((aggregated) => {
    //     const ret = {};
    //     _.each(aggregated, (agg, idx) => {
    //         ret[keysToAggregate[idx]] = agg;
    //     });
    //     return ret;
    // });
};


Dataframe.prototype.countBy = function (attribute, binning, indices, type, dataType) {
    const values = this.getColumnValues(attribute, type);

    // TODO: Get this value from a proper source, instead of hard coding.
    const maxNumBins = 29;

    if (indices.length === 0) {
        return Q({type: 'nodata'});
    }

    const rawBins = {};
    for (let i = 0; i < indices.length; i++) {
        const val = values[i];
        if (dataTypeUtil.valueSignifiesUndefined(val)) { continue; }
        rawBins[val] = (rawBins[val] || 0) + 1;
    }

    const numBins = Math.min(_.keys(rawBins).length, maxNumBins);
    const numBinsWithoutOther = numBins - 1;
    const keys = _.keys(rawBins);
    const sortedKeys = keys.sort((a, b) => {
        return rawBins[b] - rawBins[a];
    });

    // Copy over numBinsWithoutOther from rawBins to bins directly.
    // Take the rest and bucket them into '_other'
    let bins = {}, binValues;
    _.each(sortedKeys.slice(0, numBinsWithoutOther), (key) => {
        bins[key] = rawBins[key];
    });


    const otherKeys = sortedKeys.slice(numBinsWithoutOther);
    if (otherKeys.length === 1) {
        bins[otherKeys[0]] = rawBins[otherKeys[0]];
    } else if (otherKeys.length > 1) {
        // TODO ensure that this _other bin can be selected and it turn into a correct AST query.
        const sum = _.reduce(otherKeys, (memo, key) => {
            return memo + rawBins[key];
        }, 0);
        bins._other = sum;
        binValues = {_other: {representative: '_other', numValues: otherKeys.length}};
    }

    const numValues = _.reduce(_.values(bins), (memo, num) => {
        return memo + num;
    }, 0);

    return Q({
        type: 'countBy',
        dataType: dataType,
        numValues: numValues,
        numBins: _.keys(bins).length,
        bins: bins,
        binValues: binValues
    });
};


/**
 * @typedef {Object} Binning
 * @property {Number} numBins
 * @property {Number} binWidth
 * @property {Number} minValue
 * @property {Number} maxValue
 */


/**
 * @param {ColumnAggregation} aggregations
 * @param {Number} numValues
 * @param {Number} goalNumberOfBins
 * @returns {Binning} a binning object
 */
Dataframe.prototype.calculateBinning = function (aggregations, numValues, goalNumberOfBins) {
    const maxBinCount = 30;
    let goalBins = numValues > maxBinCount ?
        Math.ceil(Math.log(numValues) / Math.log(2)) + 1 :
        Math.ceil(Math.sqrt(numValues));
    goalBins = Math.min(goalBins, maxBinCount); // Cap number of bins.
    goalBins = Math.max(goalBins, 8); // Cap min number of bins.

    const max = aggregations.getAggregationByType('maxValue');
    const min = aggregations.getAggregationByType('minValue');

    const defaultBinning = {
        numBins: 1,
        binWidth: 1,
        minValue: -Infinity,
        maxValue: Infinity
    };

    let numBins;
    let bottomVal;
    let topVal;
    let binWidth;
    const range = max - min;
    let isCountBy;
    const countDistinct = aggregations.getAggregationByType('countDistinct');
    if (isNaN(range) || min === false) { // Implies non-numerical domain. Boolean needs special logic, har.
        numBins = Math.min(countDistinct, maxBinCount);
        bottomVal = min;
        topVal = max;
        isCountBy = countDistinct <= numBins;
    } else if (countDistinct < maxBinCount &&
        aggregations.getAggregationByType('isIntegral')) {
        numBins = numValues;
        bottomVal = min;
        topVal = max;
        binWidth = range / Math.max(numBins - 1, 1);
        isCountBy = range <= maxBinCount;
    } else if (goalNumberOfBins) {
        numBins = goalNumberOfBins;
        bottomVal = min;
        topVal = max;
        binWidth = range / (goalNumberOfBins - 1);

    // Try to find a good division.
    } else {
        //const goalWidth = range / goalBins;

        binWidth = 10;
        numBins = range / binWidth;

        // Edge case for invalid values
        // Should capture general case of NaNs and other invalid
        if (min === Infinity || max === -Infinity || numBins < 0) {
            return defaultBinning;
        }

        // Get to a rough approx
        while (numBins < 2 || numBins >= 100) {
            if (numBins < 2) {
                binWidth *= 0.1;
            } else {
                binWidth *= 10;
            }
            numBins = range / binWidth;
        }

        // Refine by doubling/halving
        const minBins = Math.max(3, Math.floor(goalBins / 2) - 1);
        while (numBins < minBins || numBins > goalBins) {
            if (numBins < minBins) {
                binWidth /= 2;
            } else {
                binWidth *= 2;
            }
            numBins = range / binWidth;
        }

        bottomVal = roundDownBy(min, binWidth);
        topVal = roundUpBy(max, binWidth);
        numBins = Math.floor((topVal - bottomVal) / binWidth) + 1;
    }

    // console.log('NUM BINS: ', numBins);
    // console.log('max: ', max, 'min: ', min, 'goalBins: ', goalBins);

    return {
        numBins: numBins,
        binWidth: binWidth,
        isCountBy: isCountBy,
        minValue: bottomVal,
        maxValue: topVal
    };
};

/**
 * @typedef {Object} BinDescription
 * @property {Object} min
 * @property {Object} max
 * @property {Object} representative
 * @property {Boolean} isSingular
 */


// Counts occurrences of type that matches type of time attr.
Dataframe.prototype.timeBasedHistogram = function (mask, timeType, timeAttr, start, stop, timeAggregation) {

    // Compute binning
    const startDate = new Date(start);
    const endDate = new Date(stop);

    //////////////////////////////////////////////////////////////////////////
    // COMPUTE INC / DEC FUNCTIONS
    //////////////////////////////////////////////////////////////////////////


    let incFunction;
    let decFunction;
    // TODO: Rest of time ranges
    if (timeAggregation === 'day') {
        incFunction = function (date) {
            return date.setHours(24,0,0,0);
        };
        decFunction = function (date) {
            return date.setHours(0,0,0,0);
        };
    } else if (timeAggregation === 'hour') {
        incFunction = function (date) {
            return date.setMinutes(60,0,0);
        };
        decFunction = function (date) {
            return date.setMinutes(0,0,0);
        };
    } else if (timeAggregation === 'minute') {
        incFunction = function (date) {
            return date.setSeconds(60,0);
        };
        decFunction = function (date) {
            return date.setSeconds(0,0);
        };
    } else if (timeAggregation === 'second') {
        incFunction = function (date) {
            return date.setMilliseconds(1000);
        };
        decFunction = function (date) {
            return date.setMilliseconds(0);
        };
    } else {
        return;
    }

    //////////////////////////////////////////////////////////////////////////
    // Optionally set start / stop to nice boundaries
    //////////////////////////////////////////////////////////////////////////


    // // Make sure startDate is on a nice boundary
    // decFunction(startDate);

    // // Before incrementing endDate, check to see if it's already a boundary (in which case we don't)
    // // want to increment
    // const testDate = new Date(endDate.getTime());
    // decFunction(testDate);
    // if (testDate.getTime() !== endDate.getTime()) {
    //     incFunction(endDate);
    // }

    //////////////////////////////////////////////////////////////////////////
    // Compute cutoffs
    //////////////////////////////////////////////////////////////////////////


    // TODO: We don't strictly need to compute all cutoffs to bin.
    // We should just compute numBins, width, start, stop like in normal histograms
    const cutoffs = [startDate];

    // Guess how many it would be.
    const timeA = new Date(start);
    const timeB = new Date(start);
    decFunction(timeA);
    incFunction(timeB);
    let binWidth = timeB.getTime() - timeA.getTime();

    const estimatedNumberBins = (endDate.getTime() - startDate.getTime())/binWidth;
    const MAX_BINS_TIME_HISTOGRAM = 2500;

    let approximated = false,
        runningDate, newDate;
    if (estimatedNumberBins > MAX_BINS_TIME_HISTOGRAM) {

        const diff = endDate.getTime() - startDate.getTime();
        const startNum = startDate.getTime();
        const step = Math.floor(diff / MAX_BINS_TIME_HISTOGRAM);
        runningDate = startNum + step;
        while (runningDate < endDate) {
            newDate = new Date(runningDate);
            cutoffs.push(newDate);
            runningDate += step;
        }
        approximated = true;

    } else {

        runningDate = startDate;
        let backupCount = 0;
        while (runningDate < endDate && backupCount < 100000) {
            newDate = new Date(runningDate.getTime());
            incFunction(newDate);
            if (newDate < endDate) {
                cutoffs.push(newDate);
            }
            runningDate = newDate;
            backupCount++;
        }

    }

    cutoffs.push(endDate);
    const cutoffNumbers = cutoffs.map((val/*, i*/) => {
        return val.getTime();
    });

    //////////////////////////////////////////////////////////////////////////
    // Compute bins given cutoffs
    //////////////////////////////////////////////////////////////////////////

    // Fill bins
    const numBins = cutoffs.length - 1;
    const bins = Array.apply(null, new Array(numBins)).map(() => { return 0; });
    const timeValues = this.getColumnValues(timeAttr, timeType);

    // COMPUTE BIN WIDTH
    const binWidthTestDate = new Date(start);
    decFunction(binWidthTestDate);
    const bottom = binWidthTestDate.getTime();
    incFunction(binWidthTestDate);
    const top = binWidthTestDate.getTime();

    // If we have more than 3 bins, we can just take a difference from the middle
    if (cutoffNumbers.length > 3) {
        binWidth = cutoffNumbers[2] - cutoffNumbers[1];
    } else {
        binWidth = top - bottom;
    }


    mask.mapIndexes(timeType, (idx) => {

        const value = timeValues[idx];
        const valueDate = new Date(value);
        const valueNum = valueDate.getTime();

        // Because the first and last bins can be variable width (but ONLY those)
        // We need to special case being in the first bucket, and make rest of computations
        // against the second cutoff number and inc by one

        // In bin one
        if (valueNum < cutoffNumbers[1]) {
            bins[0]++;
        } else {
            // In any other bin
            const binId = (((valueNum - cutoffNumbers[1]) / binWidth) | 0) + 1;
            bins[binId]++;
        }

        // const binId = ((valueNum - cutoffNumbers[0]) / binWidth) | 0;
        // bins[binId]++;
    });

    //////////////////////////////////////////////////////////////////////////
    // Compute offsets array for visualization purposes
    //////////////////////////////////////////////////////////////////////////

    const widths = [];
    for (let i = 0; i < cutoffNumbers.length - 1; i++) {
        widths[i] = (cutoffNumbers[i+1] - cutoffNumbers[i])/binWidth;
    }

    const rawOffsets = [];
    // Compute scan of widths
    for (let i = 0; i < widths.length; i++) {
        const prev = (i > 0) ? rawOffsets[i-1] : 0;
        rawOffsets[i] = prev + widths[i];
    }

    // Normalize rawOffsets so that they are out of 1.0;
    const denom = rawOffsets[rawOffsets.length - 1];
    const offsets = [];
    for (let i = 0; i < rawOffsets.length; i++) {
        const raw = (i > 0) ? rawOffsets[i-1] : 0;
        offsets[i] = (raw / denom);
    }

    //////////////////////////////////////////////////////////////////////////
    // Provide keys for d3
    //////////////////////////////////////////////////////////////////////////

    const keys = _.map(cutoffs, (d) => {
        const newDate = new Date(d.getTime());
        decFunction(newDate);
        return timeAggregation + newDate.getTime();
    });


    return {
        bins: bins,
        maxBin: _.max(bins),
        numBins: numBins,
        step: binWidth,
        attr: timeAttr,
        type: timeType,
        start: cutoffNumbers[cutoffNumbers.length - 1],
        topVal: cutoffNumbers[cutoffNumbers.length - 1],
        stop: cutoffNumbers[0],
        bottomVal: cutoffNumbers[0],
        timeAggregation: timeAggregation,
        cutoffs: cutoffNumbers,
        approximated: approximated,
        offsets: offsets,
        widths: widths,
        keys: keys
    };
};


Dataframe.prototype.histogram = function (attribute, binning, goalNumberOfBins, indices, type, dataType) {
    // Binning has binWidth, minValue, maxValue, and numBins

    // Disabled because filtering is expensive, and we now have type safety coming from
    // VGraph types.
    // values = _.filter(values, (x) => { return !isNaN(x)});

    const values = this.getColumnValues(attribute, type);
    const aggregations = this.getColumnAggregations(attribute, type);

    const numValues = aggregations.getAggregationByType('countDistinct');
    if (numValues === 0) {
        return Q({type: 'nodata'});
    }

    // Override if provided binning data.
    if (!binning) {
        binning = this.calculateBinning(aggregations, numValues, goalNumberOfBins);
    }
    let {numBins, binWidth, minValue, maxValue} = binning;
    let bottomVal = minValue;
    let topVal = maxValue;

    // Guard against 0 width case
    if (maxValue === minValue) {
        binWidth = 1;
        numBins = 1;
        topVal = minValue + 1;
        bottomVal = minValue;
    }

    //const qDataBuffer = this.getBuffer(attribute, type);
    const binStart = new Float32Array(numBins);
    for (let i = 0; i < numBins; i++) {
        binStart[i] = bottomVal + (binWidth * i);
    }

    //const dataSize = indices.length;

    const result = {
        type: binning.isCountBy ? 'countBy' : 'histogram',
        dataType: dataType,
        numBins: numBins,
        binWidth: binWidth,
        numValues: numValues,
        maxValue: topVal,
        minValue: bottomVal
    };

    let bins, binValues;

    // Fast path for case of only one bin.
    if (numBins === 1) {
        bins = [numValues];
        if (binning.isCountBy) {
            binValues = [{min: minValue, max: minValue, representative: minValue, isSingular: true}];
        }
        _.extend(result, {bins: bins, binValues: binValues});
        return Q(result);
    }

    // return qDataBuffer.then((dataBuffer) => {
    //     return simulator.otherKernels.histogramKernel.run(simulator, numBins, dataSize, dataBuffer, indices, binStart);
    // }).then((bins) => {
    //     return _.extend(result, {bins: bins});
    // }).fail(log.makeQErrorHandler(logger, 'Failure trying to run histogramKernel'));

    // Dead code, exists solely for timing.
    // TODO: Make this a config option.

    bins = Array.apply(null, new Array(numBins)).map(Number.prototype.valueOf, 0);
    binValues = new Array(numBins);

    // When iterating through values, we make sure to use the full value array and an
    // indices "mask" over it. This is because each histogram brush move produces a single
    // new (large) array of indices. Then each separate histogram can use the already existing
    // values array and the single indices array to compute bins without any large allocations.
    const isLessThan = dataTypeUtil.isLessThanForDataType(aggregations.getAggregationByType('dataType'));
    for (let i = 0; i < indices.length; i++) {
        // Here we use an optimized "Floor" because we know it's a smallish, positive number.
        // TODO: Have to be careful because floating point error.
        // In particular, we need to match math as closely as possible in expressions.
        let value = values[indices[i]], binId;
        if (dataTypeUtil.valueSignifiesUndefined(value)) { continue; }
        if (_.isNumber(value)) {
            binId = ((value - bottomVal) / binWidth) | 0;
        } else {
            // Least greater-than:
            binId = _.findIndex(binValues, (binValue) => isLessThan(value, binValue));
            if (binId < 0) {
                binId = 0;
            }
            binId |= 0;
        }
        if (binId > 1e6) {
            logger.warn('Invalid bin ID: ' + binId.toString() + ' generated for value: ' + JSON.stringify(value));
            continue;
        }
        bins[binId]++;
        if (binValues[binId] === undefined) {
            binValues[binId] = {min: value, max: value, representative: value, isSingular: true};
        }
        const binDescription = binValues[binId];
        if (binDescription.representative !== value) {
            binDescription.isSingular = false;
        }
        if (isLessThan(value, binDescription.min)) { binDescription.min = value; }
        if (isLessThan(binDescription.max, value)) { binDescription.max = value; }
    }

    _.extend(result, {bins: bins, binValues: binValues});
    return Q(result);
};



//////////////////////////////////////////////////////////////////////////////
// Helper Functions
//////////////////////////////////////////////////////////////////////////////


function pickTitleField (aliases, attributes, field) {
    const mapped = aliases[field];
    if (mapped && mapped in attributes) {
        return mapped;
    } else {
        const oldDeprecatedNames = [field, 'node', 'label', 'edge'];
        return _.find(oldDeprecatedNames, (f) => { return f in attributes; });
    }
}

function roundDownBy(num, multiple) {
    if (multiple === 0) {
        return num;
    }

    const div = num / multiple;
    return multiple * Math.floor(div);
}

function roundUpBy(num, multiple) {
    if (multiple === 0) {
        return num;
    }

    const div = num / multiple;
    return multiple * Math.ceil(div);
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
        for (i = 0; i < edges.length/2; i++) {
            src = edges[i*2];
            dst = edges[i*2 + 1];
            if (!edgeLookup[src]) {
                edgeLookup[src] = [];
            }
            edgeLookup[src].push(dst);
        }


        const mappedMaskInverse = new Uint32Array(oldPermutation.length);
        for (i = 0; i < mappedMaskInverse.length; i++) {
            mappedMaskInverse[i] = 1;
        }

        for (i = 0; i < edges.length/2; i++) {
            while (lastOldIdx < oldEdges.length/2) {

                src = pointOriginalLookup[oldEdges[lastOldIdx*2]];
                dst = pointOriginalLookup[oldEdges[lastOldIdx*2 + 1]];

                if ( edgeLookup[src] && edgeLookup[src].indexOf(dst) > -1 ) {
                    edgeListTyped[i*2] = src;
                    edgeListTyped[i*2 + 1] = dst;
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
            mappedScan[i] = mappedMaskInverse[i] + mappedScan[i-1];
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
            return (edges[a*2] - edges[b*2] || (edges[a*2 + 1] - edges[b*2 + 1]) || (a - b));
        });

        for (i = 0; i < edges.length/2; i++) {
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
    const workItemsTyped = new Int32Array(numPoints*4);
    let edgeListLastPos = 0;
    let edgeListLastSrc = edgesTyped[0];
    const numEdges = edgesTyped.length / 2;
    for (let i = 0; i < numPoints; i++) {

        // Case where node has edges
        if (edgeListLastSrc === i) {
            const startingIdx = edgeListLastPos;
            let count = 0;
            while (edgeListLastPos < numEdges && edgesTyped[edgeListLastPos*2] === i) {
                count++;
                edgeListLastPos++;
            }
            edgeListLastSrc = edgeListLastPos < numEdges ? edgesTyped[edgeListLastPos*2] : -1;
            workItemsTyped[i*4] = startingIdx;
            workItemsTyped[i*4 + 1] = count;
            workItemsTyped[i*4 + 2] = i;
        // Case where node has no edges
        } else {
            workItemsTyped[i*4] = -1;
            workItemsTyped[i*4 + 1] = 0;
            workItemsTyped[i*4 + 2] = i;
        }
    }

    return workItemsTyped;
}

function computeEdgeStartEndIdxs(workItemsTyped, edgesTyped, originals, numPoints) {
    //const index = 0;
    const edgeStartEndIdxsTyped = new Uint32Array(numPoints * 2);
    for(let i = 0; i < (workItemsTyped.length/4) - 1; i++) {
        const start = workItemsTyped[i * 4];
        if (start === -1) {
            edgeStartEndIdxsTyped[i * 2] = -1;
            edgeStartEndIdxsTyped[i * 2 + 1] = -1;
        } else {
            let end = workItemsTyped[(i + 1) * 4];
            let j = i + 1;
            while (end < 0 && ((j + 1) < (workItemsTyped.length / 4))) {
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
    if (workItemsTyped[(workItemsTyped.length - 4)] !== -1) {
        edgeStartEndIdxsTyped[edgeStartEndIdxsTyped.length - 2] = workItemsTyped[workItemsTyped.length - 4];
        edgeStartEndIdxsTyped[edgeStartEndIdxsTyped.length - 1] = edgesTyped.length/2;
    } else {
        edgeStartEndIdxsTyped[edgeStartEndIdxsTyped.length - 2] = -1;
        edgeStartEndIdxsTyped[edgeStartEndIdxsTyped.length - 1] = -1;
    }
    return edgeStartEndIdxsTyped;
}

function computeEdgeHeightInfo (edges) {

    const numEdges = edges.length / 2;

    const heights = new Uint32Array(numEdges);
    const seqLens = new Uint32Array(numEdges);


    let prevSrcIdx = -1;
    let prevDstIdx = -1;
    let heightCounter = 0;
    let edgeSeqLen = 1;

    for (let i = 0; i < numEdges; i ++) {

        const srcIdx = edges[i*2];
        const dstIdx = edges[i*2 + 1];

        if (prevSrcIdx === srcIdx && prevDstIdx === dstIdx) {
            heightCounter++;
        } else {
            heightCounter = 0;
            let j;

            // TODO: Make this faster and clearer
            for (j = i + 1;
                    j < numEdges &&
                    srcIdx === edges[2 * j] &&
                    dstIdx === edges[2 * j + 1];
                    j++) {
            }
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

Dataframe.prototype.encapsulateEdges = function (edges, numPoints, oldEncapsulated, masks, pointOriginalLookup) {

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
        srcToWorkItem[workItemsTyped[i*4 + 2]] = i;
        degreesTyped[workItemsTyped[i*4 + 2]] = workItemsTyped[i*4 + 1];
    }

    const edgeStartEndIdxsTyped = computeEdgeStartEndIdxs(workItemsTyped, edgesTyped, originals, numPoints);

    const {heights, seqLens} = computeEdgeHeightInfo(edgesTyped);


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


module.exports = Dataframe;

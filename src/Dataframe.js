'use strict';

var _ = require('underscore');
var dateFormat = require('dateformat');
var Q = require('q');
var fs = require('fs');
var csv = require('csv');

var log = require('common/logger.js');
var logger = log.createLogger('graph-viz', 'graph-viz/js/DataFrame.js');

var ExpressionCodeGenerator = require('./expressionCodeGenerator');
var ExpressionPlan = require('./ExpressionPlan.js');
var DataframeMask = require('./DataframeMask.js');
var ColumnAggregation = require('./ColumnAggregation.js');
var ComputedColumnManager = require('./ComputedColumnManager.js');

var dataTypeUtil = require('./dataTypes.js');

var palettes    = require('./palettes');

var baseDirPath = __dirname + '/../assets/dataframe/';
/**
 * @readonly
 * @type {string[]}
 */
var GraphComponentTypes = ['point', 'edge'];
/**
 * @readonly
 * @type {string[]}
 */
var BufferTypeKeys = GraphComponentTypes.concat('simulator');

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

    // TODO: Move this out of data frame constructor
    // var encodingsManager = new ComputedColumnManager();
    // encodingsManager.loadEncodingColumns();
    // this.loadEncodingsManager(encodingsManager);

    // TODO: Move this out of data frame constructor.
    var computedColumnManager = new ComputedColumnManager();
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
 * Relative to forwardsEdges (so sorted)
 * @param {DataframeMask} oldMask - The mask to be pruned
 * @returns DataframeMask
 */
Dataframe.prototype.pruneMaskEdges = function (oldMask) {

    // Create hash to lookup which points/edges exist in mask.
    var pointMaskOriginalLookup = {};
    oldMask.mapPointIndexes(function (idx) {
        pointMaskOriginalLookup[idx] = 1;
    });

    var edgeMask = [];
    var edges = this.rawdata.hostBuffers.forwardsEdges.edgesTyped;

    oldMask.mapEdgeIndexes(function (edgeIdx) {
        var src = edges[2*edgeIdx];
        var dst = edges[2*edgeIdx + 1];
        var newSrc = pointMaskOriginalLookup[src];
        var newDst = pointMaskOriginalLookup[dst];
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
    var resultPointMask = [];
    if (baseMask.numPoints() === this.numPoints() && baseMask.numEdges() === this.numEdges()) {
        var degreeColumn = this.getColumnValues('degree', 'point');
        baseMask.mapPointIndexes(function (pointIdx) {
            if (degreeColumn[pointIdx] !== 0) {
                resultPointMask.push(pointIdx);
            }
        });
    } else {
        var degreeOutTyped = this.getHostBuffer('forwardsEdges').degreesTyped,
            degreeInTyped = this.getHostBuffer('backwardsEdges').degreesTyped;
        if (degreeInTyped.length !== baseMask.numPoints()) {
            throw new Error('Mismatched buffer lengths');
        }
        baseMask.mapPointIndexes(function (pointIdx, idx) {
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
    var maskResponseLimit = 3e4;
    var masksTooLarge = vizSet.masks.numPoints() > maskResponseLimit ||
        vizSet.masks.numEdges() > maskResponseLimit;
    var response = masksTooLarge ? _.omit(vizSet, ['masks']) : _.clone(vizSet);
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
 * @param {Object.<Number=Infinity>} limits
 * @returns ?DataframeMask
 */
Dataframe.prototype.composeMasks = function (selectionMasks, exclusionMasks, limits) {
    if (!limits) {
        limits = {point: Infinity, edge: Infinity};
    }
    _.each(GraphComponentTypes, function (type) {
        if (limits[type] === undefined) {
            limits[type] = Infinity;
        }
    });

    // No selection masks imply a universal selection:
    if (selectionMasks.length === 0) {
        selectionMasks = [this.fullDataframeMask()];
    }

    // Assumes we will never have more than 255 separate masks.
    var numMasks = selectionMasks.length;
    var MASK_LIMIT = 255;
    if (numMasks > MASK_LIMIT) {
        console.error('TOO MANY MASKS; truncating to: ' + MASK_LIMIT);
        selectionMasks.length = 255;
    }

    // Assumes Uint8Array() constructor initializes to zero, which it should.
    var numMasksSatisfiedByPointID = new Uint8Array(this.numPoints());
    var numMasksSatisfiedByEdgeID = new Uint8Array(this.numEdges());

    // Equivalent to reduce over AND:
    _.each(selectionMasks, function (mask) {
        mask.mapEdgeIndexes(function (idx) {
            numMasksSatisfiedByEdgeID[idx]++;
        });

        mask.mapPointIndexes(function (idx) {
            numMasksSatisfiedByPointID[idx]++;
        });
    });

    // Equivalent to reduce over NOT OR:
    _.each(exclusionMasks, function (mask) {
        mask.mapPointIndexes(function (idx) {
            numMasksSatisfiedByPointID[idx] = 0;
        });
        mask.mapEdgeIndexes(function (idx) {
            numMasksSatisfiedByEdgeID[idx] = 0;
        });
    });

    // The overall masks per type, made by mask intersection:
    var result = new DataframeMask(
        this,
        [],
        []
    );

    _.each(GraphComponentTypes, function (type) {
        var limit = limits[type],
            numMasksSatisfiedByID = type === 'edge' ? numMasksSatisfiedByEdgeID : numMasksSatisfiedByPointID,
            targetMask = result[type];
        for (var i=0; i<numMasksSatisfiedByID.length; i++) {
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
    var attribute = query.attribute,
        type = query.type;
    if (attribute) {
        var normalization = this.normalizeAttributeName(attribute, type);
        if (normalization === undefined) {
            errors.push('Unknown frame element');
            return this.fullDataframeMask();
        } else {
            type = normalization.type;
            attribute = normalization.attribute;
        }
    }
    try {
        var plan = new ExpressionPlan(this, query.ast);
        var masks, filterFunc;
        if (query.ast === undefined) {
            filterFunc = this.filterFuncForQueryObject(query);
            masks = this.getAttributeMask(type, attribute, filterFunc);
        } else if (plan.isRedundant()) {
            type = plan.rootNode.iterationType();
            var normalizedAttribute = this.normalizeAttributeName(_.keys(plan.rootNode.identifierNodes())[0], type);
            if (normalizedAttribute !== undefined) {
                attribute = normalizedAttribute.attribute;
            }
            _.defaults(query, {attribute: attribute, type: type});
            filterFunc = this.filterFuncForQueryObject(query);
            masks = this.getAttributeMask(type, attribute, filterFunc);
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
    var filterFunc = _.identity;

    var ast = query.ast;
    if (ast !== undefined) {
        var generator = new ExpressionCodeGenerator('javascript');
        var columnName = this.normalizeAttributeName(query.attribute, query.type);
        if (columnName === undefined) {
            // Trust that this is still single-attribute. Doubtful idea.
            var plan = new ExpressionPlan(this, ast);
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
        var compareValue = query.equals;
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
    var mask = [];
    if (filterFunc) {
        _.each(attributeValues, function (val, idx) {
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
Dataframe.prototype.getAttributeMask = function (type, columnName, filterFunc) {
    switch (type) {
        case 'point':
            var pointMask = this.getPointAttributeMask(columnName, filterFunc);
            return new DataframeMask(
                this,
                pointMask,
                undefined
            );
        case 'edge':
            var edgeMask = this.getEdgeAttributeMask(columnName, filterFunc);
            return new DataframeMask(
                this,
                undefined,
                edgeMask
            );
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
Dataframe.prototype.getEdgeAttributeMask = function (columnName, filterFunc) {
    var attr = this.rawdata.attributes.edge[columnName];
    var edgeMask = this.getMaskForPredicateOnAttributeValues(attr.values, filterFunc);
    // Convert to sorted order
    var map = this.rawdata.hostBuffers.forwardsEdges.edgePermutation;
    for (var i = 0; i < edgeMask.length; i++) {
        edgeMask[i] = map[edgeMask[i]];
    }
    return edgeMask;
};


/**
 * Returns sorted point mask
 * @param {String} columnName
 * @param {Function<Object>} filterFunc
 * @returns {Mask}
 */
Dataframe.prototype.getPointAttributeMask = function (columnName, filterFunc) {
    var attr = this.rawdata.attributes.point[columnName];
    return this.getMaskForPredicateOnAttributeValues(attr.values, filterFunc);
};


Dataframe.prototype.initializeTypedArrayCache = function (oldNumPoints, oldNumEdges) {
    this.typedArrayCache.filteredEdges = new Uint32Array(oldNumEdges * 2);
    this.typedArrayCache.unsortedEdgeMask = new Uint32Array(oldNumEdges);
    this.typedArrayCache.edgesFlipped = new Uint32Array(oldNumEdges * 2);

    this.typedArrayCache.newPointSizes = new Uint8Array(oldNumPoints);
    this.typedArrayCache.newPointColors = new Uint32Array(oldNumPoints);
    this.typedArrayCache.newEdgeColors = new Uint32Array(oldNumEdges * 2);
    this.typedArrayCache.newEdgeHeights = new Uint32Array(oldNumEdges * 2);
    var numRenderedSplits = this.rawdata.numElements.renderedSplits;
    var numMidEdgeColorsPerEdge = 2 * (numRenderedSplits + 1);
    var numMidEdgeColors = numMidEdgeColorsPerEdge * oldNumEdges;
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
    var that = this;

    if (masks === this.lastMasks) {
        return Q(false);
    }

    var start = Date.now();

    var rawdata = this.rawdata;

    var rawSimBuffers = rawdata.buffers.simulator;

    /** @type {DataframeData} */
    var newData = makeEmptyData();
    var numPoints = masks.numPoints();
    var numEdges = masks.numEdges();
    var oldNumPoints = this.numPoints();
    var oldNumEdges = this.numEdges();

    // TODO: Should this be lazy, or done at startup?
    if (_.keys(this.typedArrayCache).length === 0) {
        this.initializeTypedArrayCache(oldNumPoints, oldNumEdges);
    }

    // labels;
    _.each(GraphComponentTypes, function (type) {
        if (rawdata.labels[type]) {
            var newLabels = [];
            _.each(masks[type], function (idx) {
                newLabels.push(rawdata.labels[type][idx]);
            });
            newData.labels[type] = newLabels;
        }
    });

    // TODO: Regular Data GPU Buffers
    // TODO: Figure out how GC/memory management works.

    ///////////////////////////////////////////////////////////////////////////
    // Simulator / Graph Specific stuff. TODO: Should this be in the dataframe?
    ///////////////////////////////////////////////////////////////////////////

    // Filter out to new edges/points arrays.
    var filteredEdges = new Uint32Array(this.typedArrayCache.filteredEdges.buffer, 0, numEdges * 2);
    var originalEdges = rawdata.hostBuffers.unsortedEdges;
    //var originalForwardsEdges = rawdata.hostBuffers.forwardsEdges.edgesTyped;

    // We start unsorted because we're working with the rawdata first.
    var unsortedEdgeMask = new Uint32Array(this.typedArrayCache.unsortedEdgeMask.buffer, 0, numEdges);

    var map = rawdata.hostBuffers.forwardsEdges.edgePermutationInverseTyped;
    masks.mapEdgeIndexes(function(edgeIndex, i) {
        unsortedEdgeMask[i] = map[edgeIndex];
    });

    // TODO: See if there's a way to do this without sorting.
    // Sorting is slow as all hell.
    Array.prototype.sort.call(unsortedEdgeMask, function (a, b) {
        return a - b;
    });

    var unsortedMasks = new DataframeMask(
        this,
        masks.point,
        unsortedEdgeMask
    );

    var pointOriginalLookup = [];
    masks.mapPointIndexes(function (pointIndex, i) {
        pointOriginalLookup[pointIndex] = i;
    });

    _.each(unsortedEdgeMask, function (oldIdx, i) {
        filteredEdges[i*2] = pointOriginalLookup[originalEdges[oldIdx*2]];
        filteredEdges[i*2 + 1] = pointOriginalLookup[originalEdges[oldIdx*2 + 1]];
    });

    var edgesFlipped = new Uint32Array(this.typedArrayCache.edgesFlipped.buffer, 0, filteredEdges.length);

    for (var i = 0; i < filteredEdges.length/2; i++) {
        edgesFlipped[2 * i] = filteredEdges[2 * i + 1];
        edgesFlipped[2 * i + 1] = filteredEdges[2 * i];
    }

    newData.hostBuffers.unsortedEdges = filteredEdges;
    var forwardsEdges = this.encapsulateEdges(filteredEdges, numPoints, rawdata.hostBuffers.forwardsEdges, unsortedMasks, pointOriginalLookup);
    var backwardsEdges = this.encapsulateEdges(edgesFlipped, numPoints, rawdata.hostBuffers.backwardsEdges, unsortedMasks, pointOriginalLookup);
    newData.hostBuffers.forwardsEdges = forwardsEdges;
    newData.hostBuffers.backwardsEdges = backwardsEdges;
    newData.hostBuffers.points = rawdata.hostBuffers.points;


    newData.localBuffers.logicalEdges = forwardsEdges.edgesTyped;
    newData.localBuffers.forwardsEdgeStartEndIdxs = forwardsEdges.edgeStartEndIdxsTyped;
    newData.localBuffers.backwardsEdgeStartEndIdxs = backwardsEdges.edgeStartEndIdxsTyped;
    // TODO index translation (filter scope)
    newData.localBuffers.selectedEdgeIndexes = this.lastSelectionMasks.typedEdgeIndexes();
    newData.localBuffers.selectedPointIndexes = this.lastSelectionMasks.typedPointIndexes();

    ///////////////////////////////////////////////////////////////////////////
    // Copy non-GPU buffers
    ///////////////////////////////////////////////////////////////////////////

    // TODO: Figured out what pointTags is used for
    // TODO: Figure out what edgeTags are used for.

    // var newPointSizes = new Uint8Array(this.typedArrayCache.newPointSizes.buffer, 0, numPoints);
    // var newPointColors = new Uint32Array(this.typedArrayCache.newPointColors.buffer, 0, numPoints);

    masks.mapPointIndexes(function (pointIndex, i) {
        // newPointSizes[i] = rawdata.localBuffers.pointSizes[pointIndex];
        // newPointColors[i] = rawdata.localBuffers.pointColors[pointIndex];
    });
    // newData.localBuffers.pointSizes = newPointSizes;
    // newData.localBuffers.pointColors = newPointColors;

    var numRenderedSplits = rawdata.numElements.renderedSplits;
    var numMidEdgeColorsPerEdge = 2 * (numRenderedSplits + 1);
    var numMidEdgeColors = numMidEdgeColorsPerEdge * numEdges;
    // var newEdgeColors = new Uint32Array(this.typedArrayCache.newEdgeColors.buffer, 0, numEdges * 2);
    // var newEdgeHeights = new Uint32Array(this.typedArrayCache.newEdgeHeights.buffer, 0, numEdges * 2);
    var newMidEdgeColors = new Uint32Array(this.typedArrayCache.newMidEdgeColors.buffer, 0, numMidEdgeColors);

    masks.mapEdgeIndexes(function (edgeIndex, i) {
        // newEdgeColors[i * 2] = rawdata.localBuffers.edgeColors[edgeIndex * 2];
        // newEdgeColors[i * 2 + 1] = rawdata.localBuffers.edgeColors[edgeIndex * 2 + 1];

        // newEdgeHeights[i * 2] = rawdata.localBuffers.edgeHeights[edgeIndex * 2];
        // newEdgeHeights[i * 2 + 1] = rawdata.localBuffers.edgeHeights[edgeIndex * 2 + 1];

        for (var j = 0; j < numMidEdgeColorsPerEdge; j++) {
            newMidEdgeColors[i * numMidEdgeColorsPerEdge + j] =
                rawdata.localBuffers.midEdgeColors[edgeIndex * numMidEdgeColorsPerEdge + j];
        }
    });
    // newData.localBuffers.edgeColors = newEdgeColors;
    // newData.localBuffers.edgeHeights = newEdgeHeights;
    newData.localBuffers.midEdgeColors = newMidEdgeColors;

    // numElements;
    // Copy all old in.
    _.each(_.keys(rawdata.numElements), function (key) {
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

    _.each(this.bufferOverlays, function (val/*, key*/) {
        var alias = val.alias;
        var type = val.type;
        var originalName = val.originalName;

        var newBuffer = that.getLocalBuffer(originalName).constructor(masks.maskSize()[type]);
        var rawBuffer = that.rawdata.localBuffers[alias];

        masks.mapIndexes(type, function (rawIndex, i) {
            newBuffer[i] = rawBuffer[rawIndex];
        });

        newData.localBuffers[alias] = newBuffer;
    });

    //////////////////////////////////
    // SIMULATOR BUFFERS.
    //////////////////////////////////

    var tempPrevForces = new Float32Array(this.typedArrayCache.tempPrevForces.buffer, 0, oldNumPoints * 2);
    var tempSpringsPos = new Float32Array(this.typedArrayCache.tempSpringsPos.buffer, 0, oldNumEdges * 4);
    var tempCurPoints = new Float32Array(this.typedArrayCache.tempCurPoints.buffer, 0, oldNumPoints * 2);

    var newPrevForces = new Float32Array(this.typedArrayCache.newPrevForces.buffer, 0, numPoints * 2);
    var newDegrees = new Uint32Array(this.typedArrayCache.newDegrees.buffer, 0, numPoints);
    var newSpringsPos = new Float32Array(this.typedArrayCache.newSpringsPos.buffer, 0, numEdges * 4);
    var newCurPoints = new Float32Array(this.typedArrayCache.newCurPoints.buffer, 0, numPoints * 2);

    var filteredSimBuffers = this.data.buffers.simulator;

    return Q.all([
        rawSimBuffers.prevForces.read(tempPrevForces),
        rawSimBuffers.springsPos.read(tempSpringsPos),
        filteredSimBuffers.curPoints.read(tempCurPoints)
    ]).spread(function () {

        ///////////////////////////////////////
        // Update last locations of points
        ///////////////////////////////////////

        var promise;
        // TODO: Move this into general initialization
        if (!that.lastPointPositions) {
            that.lastPointPositions = new Float32Array(oldNumPoints * 2);
            _.each(tempCurPoints, function (point, i) {
                that.lastPointPositions[i] = point;
            });

            promise = simulator.renderer.createBuffer(that.lastPointPositions, 'curPointsFiltered')
                .then(function (pointVBO) {
                    return simulator.cl.createBufferGL(pointVBO, 'curPointsFiltered');
                }).then(function (pointBuf) {
                    that.filteredBufferCache.simulator.curPoints = pointBuf;
                });

        } else {
            that.lastMasks.mapPointIndexes(function (pointIndex, i) {
                that.lastPointPositions[pointIndex*2] = tempCurPoints[i*2];
                that.lastPointPositions[pointIndex*2 + 1] = tempCurPoints[i*2 + 1];
            });

            promise = Q({});
        }

        return promise;

    }).then(function () {
        masks.mapPointIndexes(function (oldPointIndex, i) {
            newPrevForces[i*2] = tempPrevForces[oldPointIndex*2];
            newPrevForces[i*2 + 1] = tempPrevForces[oldPointIndex*2 + 1];

            newDegrees[i] = forwardsEdges.degreesTyped[i] + backwardsEdges.degreesTyped[i];

            newCurPoints[i*2] = that.lastPointPositions[oldPointIndex*2];
            newCurPoints[i*2 + 1] = that.lastPointPositions[oldPointIndex*2 + 1];
        });

        masks.mapEdgeIndexes(function (oldEdgeIdx, i) {
            newSpringsPos[i*4] = tempSpringsPos[oldEdgeIdx*4];
            newSpringsPos[i*4 + 1] = tempSpringsPos[oldEdgeIdx*4 + 1];
            newSpringsPos[i*4 + 2] = tempSpringsPos[oldEdgeIdx*4 + 2];
            newSpringsPos[i*4 + 3] = tempSpringsPos[oldEdgeIdx*4 + 3];
        });

        var someBufferPropertyNames = ['curPoints', 'prevForces', 'degrees', 'forwardsEdges', 'forwardsDegrees',
            'forwardsWorkItems', 'forwardsEdgeStartEndIdxs', 'backwardsEdges',
            'backwardsDegrees', 'backwardsWorkItems', 'backwardsEdgeStartEndIdxs',
            'springsPos'
        ];
        _.each(someBufferPropertyNames, function (key) {
            newData.buffers.simulator[key] = that.filteredBufferCache.simulator[key];
        });

        var newBuffers = newData.buffers.simulator;
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


    }).then(function () {
        // Delete all GPU buffers for values.
        var promises = [];
        _.each(GraphComponentTypes, function (type) {
            var buffers = that.data.buffers[type];
            _.each(_.keys(buffers), function (name) {
                //var buf = buffers[name];
                promises.push(buffers.delete);
                delete buffers[name];
            });
        });

        return Q.all(promises);

    }).then(function () {

        // Just in case, copy over references from raw data to newData
        // This means we don't have to explicitly overwrite everything.

        _.each(_.keys(rawdata.buffers.simulator), function (key) {
            if (newData.buffers.simulator[key] === undefined) {
                newData.buffers.simulator[key] = rawdata.buffers.simulator[key];
            }
        });

        _.each(_.keys(rawdata.localBuffers), function (key) {
            if (newData.localBuffers[key] === undefined) {
                newData.localBuffers[key] = rawdata.localBuffers[key];
            }
        });

        _.each(_.keys(rawdata.numElements), function (key) {
            if (newData.numElements[key] === undefined) {
                newData.numElements[key] = rawdata.numElements[key];
            }
        });

        _.each(_.keys(rawdata.rendererBuffers), function (key) {
            if (newData.rendererBuffers[key] === undefined) {
                newData.rendererBuffers[key] = rawdata.rendererBuffers[key];
            }
        });

        _.each(_.keys(rawdata.hostBuffers), function (key) {
            if (newData.hostBuffers[key] === undefined) {
                newData.hostBuffers[key] = rawdata.hostBuffers[key];
            }
        });

        // Copy in attributes from raw data
        // Bump versions of every attribute because it's versioned.
        // Also mark as dirty, due to filter.
        var attributePropertiesToSkip = ['values'];
        // Each namespace of columns
        _.each(rawdata.attributes, function (cols, colCategoryKey) {

            newData.attributes[colCategoryKey] = {};
            // Each column
            _.each(cols, function (col, colName) {
                newData.attributes[colCategoryKey][colName] = {};

                // Each key of column object
                _.each(col, function (prop, propName) {
                    if (attributePropertiesToSkip.indexOf(propName) !== -1) {
                        return;
                    }
                    newData.attributes[colCategoryKey][colName][propName] = prop;
                });

                // Bump Version
                newData.attributes[colCategoryKey][colName].version = newData.attributes[colCategoryKey][colName].version + 1 || 1;
                // Mark dirty so that computed columns and lazy eval can work.
                newData.attributes[colCategoryKey][colName].dirty = {
                    cause: 'filter'
                };

            });

        });

        // Bump versions of every buffer.
        // TODO: Decide if this is really necessary.
        _.each(_.keys(simulator.versions.buffers), function (key) {
            simulator.versions.buffers[key] += 1;
        });
        simulator.versions.tick++;

        that.lastMasks.point = unsortedMasks.point;
        that.lastMasks.edge = unsortedMasks.edge;

    }).then(function () {
        logger.debug('Filter Completed in ' + (Date.now() - start) + ' ms.');
        that.data = newData;
    });

};


//////////////////////////////////////////////////////////////////////////////
// Data Loading
//////////////////////////////////////////////////////////////////////////////

var SystemAttributeNames = [
    'pointColor', 'pointSize', 'pointTitle', 'pointLabel',
    'edgeLabel', 'edgeTitle', 'edgeHeight',
    'degree'
];

Dataframe.prototype.loadComputedColumnManager = function (computedColumnManager) {
    this.computedColumnManager = computedColumnManager;

    var attrs = this.data.attributes;
    var activeColumns = computedColumnManager.getActiveColumns();


    // TODO: Don't require them to be explicitly loaded in like this with knowldge
    // of internal structure
    // Functions that look up available column names and fetch values
    // should know how to look aside at this.
    _.each(activeColumns, function (cols, colType) {
        // If no columns exist in category, make obj
        attrs[colType] = attrs[colType] || {};

        _.each(cols, function (colDesc, name) {
            var col = {
                name: name,
                type: colDesc.type,
                version: 0,
                dirty: true,
                computed: true,
                computedVersion: colDesc.version,
                filterable: colDesc.filterable,
                graphComponentType: colDesc.graphComponentType,
                numberPerGraphComponent: colDesc.numberPerGraphComponent,
                arrType: colDesc.arrType
            };

            attrs[colType][name] = col;
        });

    });

};


Dataframe.prototype.registerNewComputedColumn = function (computedColumnManager, columnType, columnName) {
    var activeColumns = computedColumnManager.getActiveColumns();
    var colDesc = activeColumns[columnType][columnName];
    var attrs = this.data.attributes;
    attrs[columnType] = attrs[columnType] || {};

    var col = {
        name: columnName,
        type: colDesc.type,
        version: 0,
        dirty: true,
        computed: true,
        computedVersion: colDesc.version,
        filterable: colDesc.filterable,
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

    var nodeTitleField = pickTitleField(this.bufferAliases, attributeObjectsByName, 'pointTitle');
    var edgeTitleField = pickTitleField(this.bufferAliases, attributeObjectsByName, 'edgeTitle');

    var userDefinedAttributeKeys = _.keys(attributeObjectsByName)
        .filter(function (name) {
            return SystemAttributeNames.indexOf(name) === -1;
        })
        .filter(function (name) { return name !== nodeTitleField && name !== edgeTitleField; });

    var userDefinedAttributesByName = _.pick(attributeObjectsByName, function (value, key) {
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
    _.each(userDefinedAttributesByName, function (obj, key) {
        obj.version = 0;
        obj.dirty = false;
        obj.numberPerGraphComponent = 1;
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


/** Load in degrees as a universal (independent of data source) value
 * @param {Uint32Array} outDegrees - degrees going out of nodes
 * @param {Uint32Array} inDegrees - degrees going into nodes
 */
Dataframe.prototype.loadDegrees = function (outDegrees, inDegrees) {
    var numElements = this.numPoints();
    var attributes = this.rawdata.attributes.point;

    // TODO: Error handling
    if (numElements !== outDegrees.length || numElements !== inDegrees.length) {
        return;
    }

    var degree = new Array(numElements);
    var degree_in = new Array(numElements);
    var degree_out = new Array(numElements);

    for (var i = 0; i < numElements; i++) {
        degree_in[i] = inDegrees[i];
        degree_out[i] = outDegrees[i];
        degree[i] = inDegrees[i] + outDegrees[i];
    }

    attributes.degree = {values: degree, name: 'degree', type: 'number', version: 0, dirty: false, numberPerGraphComponent: 1};
    attributes.degree_in = {values: degree_in, name: 'degree_in', type: 'number', version: 0, dirty: false, numberPerGraphComponent: 1};
    attributes.degree_out = {values: degree_out, name: 'degree_out', type: 'number', version: 0, dirty: false, numberPerGraphComponent: 1};
};


/** Load in edge source/destinations as a universal (independent of data source) value
 * @param {Uint32Array} unsortedEdges - unsorted list of edges.
 */
Dataframe.prototype.loadEdgeDestinations = function (unsortedEdges) {
    var numElements = this.numEdges() || unsortedEdges.length / 2;
    var attributes = this.rawdata.attributes.edge;
    var nodeTitles = this.rawdata.attributes.point._title.values;

    var source = new Array(numElements);
    var destination = new Array(numElements);

    for (var i = 0; i < numElements; i++) {
        source[i] = nodeTitles[unsortedEdges[2*i]]
        destination[i] = nodeTitles[unsortedEdges[2*i + 1]];
    }

    attributes.Source = {values: source, name: 'Source', type: 'string', version: 0, dirty: false, numberPerGraphComponent: 1};
    attributes.Destination = {values: destination, name: 'Destination', type: 'string', version: 0, dirty: false, numberPerGraphComponent: 1};

    // If no title has been set, just make title the index.
    // TODO: Is there a more appropriate place to put this?
    if (!attributes._title) {
        attributes._title = {type: 'string', name: 'label', values: _.range(numElements), version: 0, dirty: false, numberPerGraphComponent: 1};
    }

};


/** Load in a raw OpenCL buffer object.
 *  @param {string} name - name of the buffer
 *  @param {string} type - any of [TYPES]{@link BufferTypeKeys}.
 *  @param {Object} buffer - a raw OpenCL buffer object
 */
Dataframe.prototype.loadBuffer = function (name, type, buffer) {
    var buffers = this.rawdata.buffers[type];
    buffers[name] = buffer;
};

Dataframe.prototype.writeBuffer = function (name, type, values, simulator) {
    var that = this;
    var byteLength = values.byteLength;
    var buffer = this.rawdata.buffers[type][name];

    // If it's written to directly, we assume we want to also
    // have a buffer to write to during filters.
    return simulator.cl.createBuffer(byteLength, name+'Filtered')
        .then(function (filteredBuffer) {
            that.filteredBufferCache.simulator[name] = filteredBuffer;
            return buffer.write(values);
        });
};


/** Load in a host buffer object.
 *  @param {string} name - name of the buffer
 *  @param {Object} buffer - a raw OpenCL buffer object
 */
Dataframe.prototype.loadHostBuffer = function (name, buffer) {
    var hostBuffers = this.rawdata.hostBuffers;
    hostBuffers[name] = buffer;
};


Dataframe.prototype.loadLocalBuffer = function (name, buffer) {
    // TODO: Generalize
    if (/*name === 'edgeColors' || */name === 'edgeHeights') {
        var sortedBuffer = new buffer.constructor(buffer.length);
        var permutation = this.rawdata.hostBuffers.forwardsEdges.edgePermutationInverseTyped;
        for (var i = 0; i < buffer.length / 2; i++) {
            sortedBuffer[i*2] = buffer[permutation[i]*2];
            sortedBuffer[i*2 + 1] = buffer[permutation[i]*2 +1];
        }
        buffer = sortedBuffer;
    }

    var localBuffers = this.rawdata.localBuffers;
    localBuffers[name] = buffer;
};


Dataframe.prototype.setLocalBufferValue = function (name, idx, value) {
    var localBuffers = this.rawdata.localBuffers;
    localBuffers[name][idx] = value;
};


Dataframe.prototype.loadRendererBuffer = function (name, buffer) {
    var rendererBuffers = this.rawdata.rendererBuffers;
    rendererBuffers[name] = buffer;
};


Dataframe.prototype.setHostBufferValue = function (name, idx, value) {
    var hostBuffers = this.rawdata.hostBuffers;
    hostBuffers[name][idx] = value;
};


Dataframe.prototype.loadLabels = function (type, labels) {
    this.rawdata.labels[type] = labels;
};


Dataframe.prototype.deleteBuffer = function (name) {
    var that = this;
    _.each(BufferTypeKeys, function (type) {
        _.each(_.keys(that.rawdata.buffers[type]), function (key) {
            if (key === name) {
                that.rawdata.buffers[type][key].delete();
                that.rawdata.buffers[type][key] = null;
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
    var idx = columnName ? columnName.lastIndexOf(':') : -1;
    var name = columnName;
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

    var attributes = this.rawdata.attributes[type];
    var matchKeys = _.filter(_.keys(attributes), function (key) {
        return (attributes[key].name === maybeName);
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
    var res = this.rawdata.numElements[type];
    if (!res && res !== 0) {
        throw new Error("Invalid Num Elements: " + type);
    }
    return res;
};

Dataframe.prototype.getNumElements = function (type) {
    var res = this.data.numElements[type];
    if (!res && res !== 0) {
        throw new Error("Invalid Num Elements: " + type);
    }
    return res;
};

Dataframe.prototype.getAllBuffers = function (type) {
    return this.data.buffers[type];
};

/// Buffer reset capability, specific to local buffers for now to make highlight work:

Dataframe.prototype.overlayLocalBuffer = function (type, name, alias, values) {
    if (values) {
        var newUnfilteredBuffer = this.getLocalBuffer(name).constructor(values.length); // Used to get constructor, does not care about contents
        for (var i=0; i< values.length; i++) {
            newUnfilteredBuffer[i] = values[i];
        }

        // Update rawdata (unfiltered)
        this.rawdata.localBuffers[alias] = newUnfilteredBuffer;

        var numFilteredElements = this.lastMasks.maskSize()[type];

        // TODO figure out how to generically assigned to edges (since some are strides of 2, some are 1)
        if (name === 'edgeColors') {
            numFilteredElements = this.lastMasks.maskSize()[type] * 2;
        }

        var newFilteredBuffer = newUnfilteredBuffer.constructor(numFilteredElements);

        // Filter and toss into data.
        // TODO: This is shared code between filtering code and here.
        this.lastMasks.mapIndexes(type, function (indexInRaw, i) {
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
    var hasDeprecatedExplicitLocalBuffer = this.data.localBuffers[name] !== undefined || this.rawdata.localBuffers[name] !== undefined;
    var hasComputedLocalBuffer = this.computedColumnManager.hasColumn('localBuffer', name);
    return (hasDeprecatedExplicitLocalBuffer || hasComputedLocalBuffer);
};

Dataframe.prototype.getLocalBuffer = function (name, unfiltered) {

    var data = unfiltered ? this.rawdata : this.data;

    if (this.canResetLocalBuffer(name)) {
        var alias = this.bufferOverlays[name] && this.bufferOverlays[name].alias; // Guard against no overlay
        // Prevents a possible race condition resetting a buffer alias/overlay:
        if (this.hasLocalBuffer(alias)) {
            name = alias;
        } else {
            this.resetLocalBuffer(alias);
        }
    }

    var deprecatedExplicitlySetValues = data.localBuffers[name];
    if (deprecatedExplicitlySetValues) {
        return deprecatedExplicitlySetValues;
    }

    // Get values via normal path where they're treated as computed columns.
    // TODO: Deal with "unfiltered code" path. Do we need it with computed columns?
    var res = this.getColumnValues(name, 'localBuffer');

    if (!res) {
        throw new Error("Invalid Local Buffer: " + name);
    }

    return res;
};

Dataframe.prototype.getHostBuffer = function (name) {

    var deprecatedExplicitlySetValues = this.data.hostBuffers[name];
    if (deprecatedExplicitlySetValues) {
        return deprecatedExplicitlySetValues;
    }

    var res = this.getColumnValues(name, 'hostBuffer');

    if (!res) {
        throw new Error("Invalid Host Buffer: " + name);
    }

    return res;
};

Dataframe.prototype.hasHostBuffer = function (name) {

    var hasDeprecatedExplicitHostBuffer = this.data.hostBuffers[name] !== undefined || this.rawdata.hostBuffers[name] !== undefined;
    var hasComputedHostBuffer = this.computedColumnManager.hasColumn('hostBuffer', name);
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
    var buffers = this.data.buffers[type];
    var res = buffers[name];

    if (type === 'simulator') {
        return res;
    }

    if (res) {
        return Q(res);
    } else {
        var data = this.data.attributes[type][name].values;
        var dataType = this.getDataType(name, type);

        if (dataType !== 'number') {
            throw new Error("Attempting to get buffer that is non-numeric");
        }

        var typedData = new Float32Array(data);
        var byteLength = typedData.byteLength;

        return this.simulator.cl.createBuffer(byteLength, '_' + type + '_' + name)
            .then(function (newBuffer) {
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
    var attributes = this.data.attributes[type];
    return attributes[attrName].version;
}

/** Returns the contents of one cell
 * @param {double} index - which element to extract.
 * @param {string} type - any of [TYPES]{@link BufferTypeKeys}.
 * @param {string} attrName - the name of the column you want
 * @param {Object?} attributes - which attributes to extract from the row.
 */
Dataframe.prototype.getCell = function (index, type, attrName) {

    // Convert from sorted into unsorted edge indices.
    if (index && type === 'edge') {
        var forwardsEdgePermutationInverse = this.getHostBuffer('forwardsEdges').edgePermutationInverseTyped;
        index = forwardsEdgePermutationInverse[index];
    }

    var attributes = this.data.attributes[type];
    var numberPerGraphComponent = attributes[attrName].numberPerGraphComponent;

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
    var computedVersionMatches = !(attributes[attrName].computed &&
        (attributes[attrName].computedVersion !== this.computedColumnManager.getColumnVersion(type, attrName))
    );

    if (computedVersionMatches && !attributes[attrName].dirty && attributes[attrName].values) {

        // TODO: Deduplicate this code from dataframe and computed column manager
        if (numberPerGraphComponent === 1) {
            return attributes[attrName].values[index];
        } else {
            var arrType = attributes[attrName].arrType || Array;
            var returnArr = new arrType(numberPerGraphComponent);
            for (var j = 0; j < returnArr.length; j++) {
                returnArr[j] = attributes[attrName].values[index*numberPerGraphComponent + j];
            }
            return returnArr;
        }
    }

    // If it's calculated...TODO
    if (attributes[attrName].dirty && attributes[attrName].computed) {
        var returnval = this.computedColumnManager.getValue(this, type, attrName, index);
        return returnval;
    }

    // If it's not calculated / cached, and filtered use last masks (parent) to index into already
    // calculated values
    if (attributes[attrName].dirty && attributes[attrName].dirty.cause === 'filter') {
        var parentIndex = this.lastMasks.getIndexByType(type, index);
        return this.rawdata.attributes[type][attrName].values[parentIndex];
        if (numberPerGraphComponent === 1) {
            return this.rawdata.attributes[type][attrName].values[parentIndex];
        } else {
            var arrType = attributes[attrName].arrType || Array;
            var returnArr = new arrType(numberPerGraphComponent);
            for (var j = 0; j < returnArr.length; j++) {
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
 * @param {Object?} attributes - which attributes to extract from the row.
 */
Dataframe.prototype.getRowAt = function (index, type) {
    var origIndex = index; // For clientside metadata
    var that = this;

    var row = {};
    _.each(_.keys(that.data.attributes[type]), function (key) {
        row[key] = that.getCell(index, type, key);
    });
    row._index = origIndex;
    return row;
};


/** Returns array of row (fat json) objects.
 * @param {Array.<number>} indices - which elements to extract.
 * @param {string} type - any of [TYPES]{@link BufferTypeKeys}.
 */
Dataframe.prototype.getRows = function (indices, type) {
    var that = this;

    indices = indices || _.range(that.data.numElements[type]);

    return _.map(indices, function (index) {
        return that.getRowAt(index, type);
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
    var attributes = this.rawdata.attributes[type],
        keys = this.getAttributeKeys(type);

    indices = indices || _.range(this.data.numElements[type]);

    var lastMasks = this.lastMasks;

    var values = _.map(indices, function (index) {
        index = lastMasks.getIndexByType(type, index);
        var row = [];
        _.each(keys, function (key) {
            row.push(attributes[key].values[index]);
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

var LargeColumnProperties = ['values', 'aggregations'];

Dataframe.prototype.getColumn = function (columnName, type) {
    return _.omit(this.rawdata.attributes[type][columnName], LargeColumnProperties);
};


/**
 * @typedef {Object} Column
 * @property {Array} values
 * @property {String} type
 * @property {Object} target
 */


// TODO: Have this return edge attributes in sorted order, unless
// explicitly requested to be unsorted (for internal performance reasons)
Dataframe.prototype.getColumnValues = function (columnName, type) {

    var attributes = this.data.attributes[type];

    // TODO FIXME HACK:
    // So computed column manager can work, we need to pass through calls from here
    // to getHostBuffer.

    if (type === 'hostBuffer' && (!attributes || !attributes[columnName])) {
        return this.getHostBuffer(columnName);
    }

    if (type === 'localBuffer' && (!attributes || !attributes[columnName])) {
        return this.getLocalBuffer(columnName);
    }


    // First try to see if have values already calculated / cached for this frame

    // Check to see if it's computed and version matches that of computed column.
    // Computed column versions reflect dependencies between computed columns.
    var computedVersionMatches = !(attributes[columnName].computed &&
        (attributes[columnName].computedVersion !== this.computedColumnManager.getColumnVersion(type, columnName))
    );

    if (computedVersionMatches && !attributes[columnName].dirty && attributes[columnName].values) {
        console.log('Returning Cached');
        return attributes[columnName].values;
    }

    // If it's calculated...TODO
    if (attributes[columnName].dirty && attributes[columnName].computed) {

        console.log('Recalculating');

        var newValues = this.computedColumnManager.getArray(this, type, columnName);
        attributes[columnName].values = newValues;
        attributes[columnName].dirty = false;

        return newValues;
    }


    // If it's not calculated / cached, and filtered, apply the mask and compact
    // then cache the result.
    if (attributes[columnName].dirty && attributes[columnName].dirty.cause === 'filter') {

        console.log('in dirty filter path for ', type, columnName);

        var rawAttributes = this.rawdata.attributes[type];
        var arrType = rawAttributes[columnName].arrType || Array;
        var numNewValues = this.lastMasks.numByType(type);
        var numberPerGraphComponent = rawAttributes[columnName].numberPerGraphComponent;
        var newValues = new arrType(numberPerGraphComponent * numNewValues);

        this.lastMasks.mapIndexes(type, function (idx, i) {
            for (var j = 0; j < numberPerGraphComponent; j++) {
                newValues[numberPerGraphComponent*i + j] = rawAttributes[columnName].values[numberPerGraphComponent*idx + j];
            }
            // newValues.push(rawAttributes[columnName].values[idx]);
        });

        attributes[columnName].values = newValues;
        attributes[columnName].dirty = false;

        return newValues;
    }

    // Nothing was found, so throw error.
    throw new Error("Couldn't get column values for: " + columnName);
};


// TODO: Track modifications to underlying GPU buffer,
// so we can flag them as dirty='CL' or something and know to copy off GPU.
Dataframe.prototype.getClBuffer = function (cl, columnName, type) {

    var that = this;
    var attributes = this.data.attributes[type];

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
    var computedVersionMatches = !(attributes[columnName].computed &&
        (attributes[columnName].computedVersion !== this.computedColumnManager.getColumnVersion(type, columnName))
    );

    if (computedVersionMatches && !attributes[columnName].dirty && attributes[columnName].clBuffer) {
        console.log('Returning Cached CL Buffer');
        return Q(attributes[columnName].clBuffer);
    }

    // Need to fix CL Buffer. Today, naively get all columns and do a full copy.
    // In the future, do this more cleverly (e.g., GPU filter + compact)

    var newValues = this.getColumnValues(columnName, type);

    // TODO: Add eviction to generic CL Buffer caching.
    return this.getCachedCLBuffer(cl, columnName, type)
        .then(function (buffer) {
            return buffer.write(newValues);
        }).then(function (buffer) {
            attributes[columnName].clBuffer = buffer;
            return buffer;
        });
};


// TODO: Add eviction to generic CL Buffer caching.
Dataframe.prototype.getCachedCLBuffer = function (cl, columnName, type) {
    var desc = this.data.attributes[type][columnName];
    var arrType = desc.arrType;

    if (arrType === Array) {
        throw new Error('Attempted to make CL Buffer for non-typed array: ', columnName, type);
    }

    var graphComponentType = desc.graphComponentType || type;
    var numElements = this.getNumElements(graphComponentType);

    this.clBufferCache[type] = this.clBufferCache[type] || {};
    var cache = this.clBufferCache[type];

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
        .then(function (buffer) {
            cache[columnName] = buffer;
            return buffer;
        });
};


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
 * @property {Object.<Number>} distinctValues count of instances by value
 * @property {Object} maxValue
 * @property {Object} minValue
 * @property {Number} standardDeviation
 * @property {Number} averageValue
 * @property {Number} sum
 * @property {Object} binning
 */


Dataframe.prototype.metadataForColumn = function (columnName, type) {
    var metadata, defs, defsContainer;
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
    defs = _.find(defsContainer, function (eachDefs) { return eachDefs[columnName] !== undefined; });
    if (defs !== undefined) {
        metadata = defs[columnName];
    }
    return metadata;
};


/**
 * @returns {ColumnAggregation}
 */
Dataframe.prototype.getColumnAggregations = function(columnName, type, unfiltered) {
    var dataframeData = (unfiltered ? this.rawdata : this.data);
    var column = dataframeData.attributes[type][columnName];
    if (column === undefined) { return undefined; }
    if (column.aggregations === undefined) {
        column.aggregations = new ColumnAggregation(this, column, columnName, type);
        var aggregations = this.metadataForColumn(columnName, type);
        if (aggregations !== undefined) {
            if (aggregations.aggregations !== undefined) {
                aggregations = aggregations.aggregations;
            }
            column.aggregations.updateAggregations(aggregations);
        }
    }
    return column.aggregations;
};


/** Auto-detect when a buffer is filled with our ETL-defined color space and map that directly:
 * TODO don't have ETL magically encode the color space; it doesn't save space, time, code, or style.
 * @returns {Boolean}
 */
Dataframe.prototype.doesColumnRepresentColorPaletteMap = function (type, columnName) {
    var aggregations = this.getColumnAggregations(columnName, type, true);
    var aggType = 'fitsColorPaletteMap';
    if (!aggregations.hasAggregationByType(aggType)) {
        var fits = false;
        if (this.getDataType(columnName, type) === 'color' &&
            aggregations.getAggregationByType('dataType') === 'integer') {
            var distinctValues = _.keys(aggregations.getAggregationByType('distinctValues'));
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

Dataframe.prototype.sortEdgeColumnValues = function (type, values) {
    if (type === 'edge') {
        // Convert to sorted order
        var map = this.rawdata.hostBuffers.forwardsEdges.edgePermutation;
        for (var i = 0; i < values.length; i++) {
            // FIXME
            values[i] = values[map[i]];
        }
    }
};


Dataframe.prototype.mapUnfilteredColumnValues = function (type, columnName, func) {
    var attr = this.rawdata.attributes[type][columnName];
    var results = func === undefined ? attr.values : _.map(attr.values, func);
    this.sortEdgeColumnValues(type, results);
    return results;
};


Dataframe.prototype.getUnfilteredColumnValues = function (type, columnName) {
    return this.mapUnfilteredColumnValues(type, columnName, undefined);
};




Dataframe.prototype.getAttributeKeys = function (type) {
    // Assumes that filtering doesn't add/remove columns
    // TODO: Generalize so that we can add/remove columns
    return _.sortBy(
        _.keys(this.rawdata.attributes[type]),
        _.identity
    );
};


Dataframe.prototype.getColumnsByType = function () {
    var result = {};
    var that = this;
    _.each(GraphComponentTypes, function (typeName) {
        var typeResult = {};
        var columnNamesPerType = that.getAttributeKeys(typeName);
        _.each(columnNamesPerType, function (columnName) {
            typeResult[columnName] = that.getColumn(columnName, typeName);
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
    var that = this;
    var toSerialize = {};

    _.each(BufferTypeKeys, function (type) {
        if (options.compact) {
            toSerialize[type] = that.getRowsCompactUnfiltered(undefined, type);
        } else {
            toSerialize[type] = that.getRows(undefined, type);
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
    var that = this;
    var toSerialize = {};

    _.each(BufferTypeKeys, function (type) {
        toSerialize[type] = {};
        var keys = that.getAttributeKeys(type);
        _.each(keys, function (key) {
            toSerialize[type][key] = that.getColumnValues(key, type);
        });
    });

    serialize(toSerialize, options.compress, target);
};

/** Return a promise of a string CSV representation of the dataframe
 */
Dataframe.prototype.formatAsCsv = function (type) {
    var that = this;

    var compact = that.getRowsCompactUnfiltered(undefined, type);
    var promiseStringify = Q.denodeify(csv.stringify);
    console.log('compact header: ', compact.header);
    var structuredArrays = [compact.header].concat(compact.values);

    return promiseStringify(structuredArrays);

};

//////////////////////////////////////////////////////////////////////////////
// Aggregations and Histograms
//////////////////////////////////////////////////////////////////////////////


// [int] * ?[ string ] * ?{string -> ??} * ?{countBy, ??} * {point, edge, undefined}
// -> ??
//undefined type signifies both nodes and edges
Dataframe.prototype.aggregate = function (indices, attributes, binning, mode, type) {

    var that = this;
    // convert indices for edges from sorted to unsorted;
    if (type === 'edge') {
        var unsortedIndices = [];
        var forwardsEdgePermutationInverse = this.getHostBuffer('forwardsEdges').edgePermutationInverseTyped;
        _.each(indices, function (v) {
            unsortedIndices.push(forwardsEdgePermutationInverse[v]);
        });
        indices = unsortedIndices;
    }

    var processAgg = function (attribute, indices) {

        var goalNumberOfBins = binning ? binning._goalNumberOfBins : 0;
        var binningHint = binning ? binning[attribute] : undefined;
        var dataType = that.getDataType(attribute, type);

        if (mode !== 'countBy' && dataType !== 'string') {
            return that.histogram(attribute, binningHint, goalNumberOfBins, indices, type, dataType);
        } else {
            return that.countBy(attribute, binningHint, indices, type, dataType);
        }
    };

    var validAttributes = this.getAttributeKeys(type);
    var keysToAggregate = attributes ? attributes : validAttributes;

    keysToAggregate = keysToAggregate.filter(function (val) {
        return val[0] !== '_';
    }).filter(function (val) {
        // Make sure that valid attributes were passed in.
        return validAttributes.indexOf(val) > -1;
    });


    var chain = Q(); //simulator.otherKernels.histogramKernel.setIndices(simulator, indices);
    var aggregated = {};

    _.each(keysToAggregate, function (attribute) {

        chain = chain.then(function() {
            return processAgg(attribute, indices)
                .then(function (agg) {
                    // Store result
                    aggregated[attribute] = agg;

                    // Force loop restart before handling next
                    // So async IO can go through, e.g., VBO updates
                    var waitForNextTick = Q.defer();
                    process.nextTick(function () {
                        waitForNextTick.resolve();
                    });
                    return waitForNextTick.promise;
                });
        });
    });

    return chain.then(function() {
        return aggregated;
    });


    // Array of promises
    // var promisedAggregates = _.map(keysToAggregate, function (attribute) {
    //     return processAgg(attribute, indices);
    // });

    // return Q.all(promisedAggregates).then(function (aggregated) {
    //     var ret = {};
    //     _.each(aggregated, function (agg, idx) {
    //         ret[keysToAggregate[idx]] = agg;
    //     });
    //     return ret;
    // });
};


Dataframe.prototype.countBy = function (attribute, binning, indices, type, dataType) {
    var values = this.getColumnValues(attribute, type);

    // TODO: Get this value from a proper source, instead of hard coding.
    var maxNumBins = 29;

    if (indices.length === 0) {
        return Q({type: 'nodata'});
    }

    var rawBins = {};
    for (var i = 0; i < indices.length; i++) {
        var val = values[i];
        if (dataTypeUtil.valueSignifiesUndefined(val)) { continue; }
        rawBins[val] = (rawBins[val] || 0) + 1;
    }

    var numBins = Math.min(_.keys(rawBins).length, maxNumBins);
    var numBinsWithoutOther = numBins - 1;
    var keys = _.keys(rawBins);
    var sortedKeys = keys.sort(function (a, b) {
        return rawBins[b] - rawBins[a];
    });

    // Copy over numBinsWithoutOther from rawBins to bins directly.
    // Take the rest and bucket them into '_other'
    var bins = {}, binValues;
    _.each(sortedKeys.slice(0, numBinsWithoutOther), function (key) {
        bins[key] = rawBins[key];
    });


    var otherKeys = sortedKeys.slice(numBinsWithoutOther);
    if (otherKeys.length === 1) {
        bins[otherKeys[0]] = rawBins[otherKeys[0]];
    } else if (otherKeys.length > 1) {
        // TODO ensure that this _other bin can be selected and it turn into a correct AST query.
        var sum = _.reduce(otherKeys, function (memo, key) {
            return memo + rawBins[key];
        }, 0);
        bins._other = sum;
        binValues = {_other: {representative: '_other', numValues: otherKeys.length}};
    }

    var numValues = _.reduce(_.values(bins), function (memo, num) {
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
    var maxBinCount = 30;
    var goalBins = numValues > maxBinCount ?
        Math.ceil(Math.log(numValues) / Math.log(2)) + 1 :
        Math.ceil(Math.sqrt(numValues));
    goalBins = Math.min(goalBins, maxBinCount); // Cap number of bins.
    goalBins = Math.max(goalBins, 8); // Cap min number of bins.

    var max = aggregations.getAggregationByType('maxValue');
    var min = aggregations.getAggregationByType('minValue');

    var defaultBinning = {
        numBins: 1,
        binWidth: 1,
        minValue: -Infinity,
        maxValue: Infinity
    };

    var numBins;
    var bottomVal;
    var topVal;
    var binWidth;
    var range = max - min;
    var isCountBy;
    var countDistinct = aggregations.getAggregationByType('countDistinct');
    if (isNaN(range)) { // Implies non-numerical domain.
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
        //var goalWidth = range / goalBins;

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
        var minBins = Math.max(3, Math.floor(goalBins / 2) - 1);
        while (numBins < minBins || numBins > goalBins) {
            if (numBins < minBins) {
                binWidth /= 2;
            } else {
                binWidth *= 2;
            }
            numBins = range / binWidth;
        }

        bottomVal = round_down(min, binWidth);
        topVal = round_up(max, binWidth);
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
    var startDate = new Date(start);
    var endDate = new Date(stop);

    //////////////////////////////////////////////////////////////////////////
    // COMPUTE INC / DEC FUNCTIONS
    //////////////////////////////////////////////////////////////////////////


    var incFunction;
    var decFunction;
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
    // // want to incremement
    // var testDate = new Date(endDate.getTime());
    // decFunction(testDate);
    // if (testDate.getTime() !== endDate.getTime()) {
    //     incFunction(endDate);
    // }

    //////////////////////////////////////////////////////////////////////////
    // Compute cutoffs
    //////////////////////////////////////////////////////////////////////////


    // TODO: We don't strictly need to compute all cutoffs to bin.
    // We should just compute numBins, width, start, stop like in normal histograms
    var cutoffs = [startDate];

    // Guess how many it would be.
    var timeA = new Date(start);
    var timeB = new Date(start);
    decFunction(timeA);
    incFunction(timeB);
    var binWidth = timeB.getTime() - timeA.getTime();

    var estimatedNumberBins = (endDate.getTime() - startDate.getTime())/binWidth;
    var MAX_BINS_TIME_HISTOGRAM = 2500;

    var approximated = false,
        runningDate, newDate;
    if (estimatedNumberBins > MAX_BINS_TIME_HISTOGRAM) {

        var diff = endDate.getTime() - startDate.getTime();
        var startNum = startDate.getTime();
        var step = Math.floor(diff / MAX_BINS_TIME_HISTOGRAM);
        runningDate = startNum + step;
        while (runningDate < endDate) {
            newDate = new Date(runningDate);
            cutoffs.push(newDate);
            runningDate += step;
        }
        approximated = true;

    } else {

        runningDate = startDate;
        var backupCount = 0;
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
    var cutoffNumbers = cutoffs.map(function (val/*, i*/) {
        return val.getTime();
    });

    //////////////////////////////////////////////////////////////////////////
    // Compute bins given cutoffs
    //////////////////////////////////////////////////////////////////////////

    // Fill bins
    var numBins = cutoffs.length - 1;
    var bins = Array.apply(null, new Array(numBins)).map(function () { return 0; });
    var timeValues = this.getColumnValues(timeAttr, timeType);

    // COMPUTE BIN WIDTH
    var binWidthTestDate = new Date(start);
    decFunction(binWidthTestDate);
    var bottom = binWidthTestDate.getTime();
    incFunction(binWidthTestDate);
    var top = binWidthTestDate.getTime();

    // If we have more than 3 bins, we can just take a difference from the middle
    if (cutoffNumbers.length > 3) {
        binWidth = cutoffNumbers[2] - cutoffNumbers[1];
    } else {
        binWidth = top - bottom;
    }


    mask.mapIndexes(timeType, function (idx) {
        var value = timeValues[idx];
        var valueDate = new Date(value);
        var valueNum = valueDate.getTime();

        // Because the first and last bins can be variable width (but ONLY those)
        // We need to special case being in the first bucket, and make rest of computations
        // against the second cutoff number and inc by one

        // In bin one
        if (valueNum < cutoffNumbers[1]) {
            bins[0]++;
        } else {
            // In any other bin
            var binId = (((valueNum - cutoffNumbers[1]) / binWidth) | 0) + 1;
            bins[binId]++;
        }

        // var binId = ((valueNum - cutoffNumbers[0]) / binWidth) | 0;
        // bins[binId]++;
    });

    //////////////////////////////////////////////////////////////////////////
    // Compute offsets array for visualization purposes
    //////////////////////////////////////////////////////////////////////////

    var widths = [];
    var i;
    for (i = 0; i < cutoffNumbers.length - 1; i++) {
        widths[i] = (cutoffNumbers[i+1] - cutoffNumbers[i])/binWidth;
    }

    var rawOffsets = [];
    // Compute scan of widths
    for (i = 0; i < widths.length; i++) {
        var prev = (i > 0) ? rawOffsets[i-1] : 0;
        rawOffsets[i] = prev + widths[i];
    }

    // Normalize rawOffsets so that they are out of 1.0;
    var denom = rawOffsets[rawOffsets.length - 1];
    var offsets = [];
    for (i = 0; i < rawOffsets.length; i++) {
        var raw = (i > 0) ? rawOffsets[i-1] : 0;
        offsets[i] = (raw / denom);
    }

    //////////////////////////////////////////////////////////////////////////
    // Provide keys for d3
    //////////////////////////////////////////////////////////////////////////

    var keys = _.map(cutoffs, function (d) {
        var newDate = new Date(d.getTime());
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
    // values = _.filter(values, function (x) { return !isNaN(x)});

    var values = this.getColumnValues(attribute, type);
    var aggregations = this.getColumnAggregations(attribute, type);

    var numValues = aggregations.getAggregationByType('countDistinct');
    if (numValues === 0) {
        return Q({type: 'nodata'});
    }

    // Override if provided binning data.
    if (!binning) {
        binning = this.calculateBinning(aggregations, numValues, goalNumberOfBins);
    }
    var numBins = binning.numBins;
    var binWidth = binning.binWidth;
    var bottomVal = binning.minValue;
    var topVal = binning.maxValue;
    var min = binning.minValue;
    var max = binning.maxValue;

    // Guard against 0 width case
    if (max === min) {
        binWidth = 1;
        numBins = 1;
        topVal = min + 1;
        bottomVal = min;
    }

    //var qDataBuffer = this.getBuffer(attribute, type);
    var binStart = new Float32Array(numBins);
    var i;
    for (i = 0; i < numBins; i++) {
        binStart[i] = bottomVal + (binWidth * i);
    }

    //var dataSize = indices.length;

    var retObj = {
        type: binning.isCountBy ? 'countBy' : 'histogram',
        dataType: dataType,
        numBins: numBins,
        binWidth: binWidth,
        numValues: numValues,
        maxValue: topVal,
        minValue: bottomVal
    };

    var bins, binValues;

    // Fast path for case of only one bin.
    if (numBins === 1) {
        bins = [numValues];
        if (binning.isCountBy) {
            binValues = [{min: min, max: min, representative: min, isSingular: true}];
        }
        _.extend(retObj, {bins: bins, binValues: binValues});
        return Q(retObj);
    }

    // return qDataBuffer.then(function (dataBuffer) {
    //         return simulator.otherKernels.histogramKernel.run(simulator, numBins, dataSize, dataBuffer, indices, binStart);
    //     }).then(function (bins) {
    //         return _.extend(retObj, {bins: bins});
    //     }).fail(log.makeQErrorHandler(logger, 'Failure trying to run histogramKernel'));

    // Dead code, exists solely for timing.
    // TODO: Make this a config option.

    bins = Array.apply(null, new Array(numBins)).map(function () { return 0; });
    binValues = new Array(numBins);


    // When iterating through values, we make sure to use the full value array and an
    // indices "mask" over it. This is because each histogram brush move produces a single
    // new (large) array of indices. Then each separate histogram can use the already existing
    // values array and the single indices array to compute bins without any large allocations.
    var binId, value;
    var isLessThan = dataTypeUtil.isLessThanForDataType(aggregations.getAggregationByType('dataType'));
    for (i = 0; i < indices.length; i++) {
        // Here we use an optimized "Floor" because we know it's a smallish, positive number.
        // TODO: Have to be careful because floating point error.
        // In particular, we need to match math as closely as possible in expressions.
        value = values[indices[i]];
        if (dataTypeUtil.valueSignifiesUndefined(value)) { continue; }
        if (_.isNumber(value)) {
            binId = ((value - bottomVal) / binWidth) | 0;
        } else {
            for (var eachBinId = 0; eachBinId < numBins; eachBinId++) {
                if (!isLessThan(binValues[eachBinId])) {
                    binId = eachBinId;
                    break;
                }
            }
            binId |= 0;
        }
        bins[binId]++;
        if (binValues[binId] === undefined) {
            binValues[binId] = {min: value, max: value, representative: value, isSingular: true};
        }
        var binDescription = binValues[binId];
        if (binDescription.representative !== value) {
            binDescription.isSingular = false;
        }
        if (isLessThan(value, binDescription.min)) { binDescription.min = value; }
        if (isLessThan(binDescription.max, value)) { binDescription.max = value; }
    }

    _.extend(retObj, {bins: bins, binValues: binValues});
    return Q(retObj);
};



//////////////////////////////////////////////////////////////////////////////
// Helper Functions
//////////////////////////////////////////////////////////////////////////////


function decodeStrings (attributes) {
    _.each(_.keys(attributes), function (key) {
        var decoded = _.map(attributes[key].values, function (val) {
            try {
                return (typeof val === 'string') ? decodeURIComponent(val) : val;
            } catch (e) {
                console.error('bad read val', val);
                return val;
            }
        });
        attributes[key].values = decoded;
    });
}

function decodeDates (attributes) {
    _.each(_.keys(attributes), function (key) {
        var isDate = key.indexOf('Date') > -1;
        var decoded = _.map(attributes[key].values, function (val) {
            return isDate && typeof(val) === "number" ?
                    dateFormat(val, 'mm-dd-yyyy') : val;
        });
        attributes[key].values = decoded;
    });
}


function pickTitleField (aliases, attributes, field) {
    var mapped = aliases[field];
    if (mapped && mapped in attributes) {
        return mapped;
    } else {
        var oldDeprecatedNames = [field, 'node', 'label', 'edge'];
        return _.find(oldDeprecatedNames, function (f) { return f in attributes; });
    }
}

function round_down(num, multiple) {
    if (multiple === 0) {
        return num;
    }

    var div = num / multiple;
    return multiple * Math.floor(div);
}

function round_up(num, multiple) {
    if (multiple === 0) {
        return num;
    }

    var div = num / multiple;
    return multiple * Math.ceil(div);
}

/**
 * @param {Array<Number>} values
 * @param {Mask} indices
 * @returns {{max: number, min: Number}}
 */
function minMaxMasked(values, indices) {
    var min = Infinity;
    var max = -Infinity;

    _.each(indices, function (valueIdx) {
        var val = values[valueIdx];
        if (val < min) {
            min = val;
        }
        if (val > max) {
            max = val;
        }
    });
    return {max: max, min: min};
}

function serialize(data, compressFunction, target) {
    var serialized = JSON.stringify(data);

    if (compressFunction) {
        serialized = compressFunction(serialized);
    }

    fs.writeFileSync(baseDirPath + target, serialized);
}

function pad(n, width, z) {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

function computeEdgeList(edges, oldEncapsulated, masks, pointOriginalLookup) {

    var edgeListTyped = new Uint32Array(edges.length);
    var mapped = new Uint32Array(edges.length / 2);
    var i, src, dst, idx;

    // If we're filtering and have information on unfiltered data.
    // TODO: Undisable once this is fixed with multi-edge / self edge.
    if (false && oldEncapsulated && masks) {
        var oldEdges = oldEncapsulated.edgesTyped;
        var oldPermutation = oldEncapsulated.edgePermutationInverseTyped;
        var lastOldIdx = 0;

        // Lookup to see if an edge is included.
        var edgeLookup = {};
        for (i = 0; i < edges.length/2; i++) {
            src = edges[i*2];
            dst = edges[i*2 + 1];
            if (!edgeLookup[src]) {
                edgeLookup[src] = [];
            }
            edgeLookup[src].push(dst);
        }


        var mappedMaskInverse = new Uint32Array(oldPermutation.length);
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
        var mappedScan = new Uint32Array(mappedMaskInverse.length);
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
        var maskedEdgeList = new Float64Array(edgeListTyped.buffer);
        var maskedEdges = new Float64Array(edges.buffer);

        for (i = 0; i < mapped.length; i++) {
            mapped[i] = i;
        }

        Array.prototype.sort.call(mapped, function (a, b) {
            return (edges[a*2] - edges[b*2] || (edges[a*2 + 1] - edges[b*2 + 1]));
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
    var workItemsTyped = new Int32Array(numPoints*4);
    var edgeListLastPos = 0;
    var edgeListLastSrc = edgesTyped[0];
    var numEdges = edgesTyped.length / 2;
    for (var i = 0; i < numPoints; i++) {

        // Case where node has edges
        if (edgeListLastSrc === i) {
            var startingIdx = edgeListLastPos;
            var count = 0;
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
    //var index = 0;
    var edgeStartEndIdxsTyped = new Uint32Array(numPoints * 2);
    for(var i = 0; i < (workItemsTyped.length/4) - 1; i++) {
      var start = workItemsTyped[i*4];
      if (start === -1) {
        edgeStartEndIdxsTyped[i*2] = -1;
        edgeStartEndIdxsTyped[i*2 + 1] = -1;
      } else {
        var end = workItemsTyped[(i+1)*4];
        var j = i+1;
        while (end < 0 && ((j + 1) < (workItemsTyped.length/4))) {
          end = workItemsTyped[(j + 1)*4];
          j = j + 1;
        }

        if (end === -1) {
            end = edgesTyped.length / 2; // Special case for last work item
        }
        edgeStartEndIdxsTyped[i*2] = start;
        edgeStartEndIdxsTyped[i*2 + 1] = end;
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


Dataframe.prototype.encapsulateEdges = function (edges, numPoints, oldEncapsulated, masks, pointOriginalLookup) {

    //[[src idx, dest idx, original idx]]
    var edgeListObj = computeEdgeList(edges, oldEncapsulated, masks, pointOriginalLookup);
    var edgesTyped = edgeListObj.edgeListTyped;
    var originals = edgeListObj.originals;

    var edgePermutationInverseTyped = originals;
    // var edgePermutationTyped = originals;
    var edgePermutationTyped = new Uint32Array(edgesTyped.length / 2);
    _.each(edgePermutationInverseTyped, function (val, i) {
        edgePermutationTyped[val] = i;
    });

    // [ [first edge number from src idx, numEdges from source idx, source idx], ... ]
    //workItemsTyped is a Uint32Array [first edge number from src idx, number of edges from src idx, src idx, 666]
    var workItemsTyped = computeWorkItemsTyped(edgesTyped, originals, numPoints);

    var degreesTyped = new Uint32Array(numPoints);
    var srcToWorkItem = new Int32Array(numPoints);

    for (var i = 0; i < numPoints; i++) {
        srcToWorkItem[workItemsTyped[i*4 + 2]] = i;
        degreesTyped[workItemsTyped[i*4 + 2]] = workItemsTyped[i*4 + 1];
    }

    var edgeStartEndIdxsTyped = computeEdgeStartEndIdxs(workItemsTyped, edgesTyped, originals, numPoints);

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

        edgeStartEndIdxsTyped: edgeStartEndIdxsTyped
    };
};


module.exports = Dataframe;

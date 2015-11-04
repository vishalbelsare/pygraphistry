'use strict';

var _ = require('underscore');

// Duplicated from Dataframe.js
var GraphComponentTypes = ['point', 'edge'];

/**
 * Mask is implemented as a list of valid indices (in sorted order).
 * @typedef Array<Number> Mask
 */

/**
 * @typedef Array<Mask> MaskList
 */

/**
 * @param {Dataframe} dataframe
 * @param {Mask} pointIndexes Sorted list of indexes into the raw points data. If undefined, means all indexes.
 * @param {Mask} edgeIndexes Sorted list of indexes into the raw edges data. If undefined, means all indexes.
 * @param {Boolean?} indexesInFilteredFrame Whether the indexes are supplied from a client-centric indexing (data vs rawdata).
 * @constructor
 */
function DataframeMask(dataframe, pointIndexes, edgeIndexes, indexesInFilteredFrame) {
    this.dataframe = dataframe;
    var pointMask = pointIndexes;
    var edgeMask = edgeIndexes;
    if (indexesInFilteredFrame) {
        var lastMasks = dataframe.lastMasks;
        var i = 0;
        if (pointMask !== undefined && lastMasks.point !== undefined) {
            var translatedPointMask = new Uint32Array(pointMask.length);
            for (i=0; i<pointMask.length; i++) {
                translatedPointMask[i] = lastMasks.point[pointMask[i]];
            }
            pointMask = translatedPointMask;
        }
        if (edgeMask !== undefined && lastMasks.edge !== undefined) {
            var translatedEdgeMask = new Uint32Array(edgeMask.length);
            for (i=0; i<edgeMask.length; i++) {
                translatedEdgeMask[i] = lastMasks.edge[edgeMask[i]];
            }
            edgeMask = translatedEdgeMask;
        }
    }
    if (pointMask instanceof ArrayBuffer) { pointMask = new Uint32Array(pointMask); }
    if (edgeMask instanceof ArrayBuffer) { edgeMask = new Uint32Array(edgeMask); }
    this.point = pointMask;
    this.edge = edgeMask;
}

DataframeMask.prototype.numByType = function (type) {
    return this[type] !== undefined ? this[type].length : this.dataframe.getNumElements(type);
};

DataframeMask.prototype.numPoints = function () {
    return this.numByType('point');
};

DataframeMask.prototype.numEdges = function () {
    return this.numByType('edge');
};

DataframeMask.prototype.limitNumByTypeTo = function (type, limit) {
    if (limit >= this.numByType(type)) { return; }
    if (this[type] === undefined) {
        this[type] = _.range(limit);
    } else {
        this[type].length = limit;
    }
};

/**
 * Returns the union of two sorted arrays of integers.
 * @param {Mask} x
 * @param {Mask} y
 * @returns {Mask}
 */
DataframeMask.unionOfTwoMasks = function(x, y) {
    var xLength = x.length, yLength = y.length;
    // Smallest result: one is a subset of the other.
    var result = new Array(Math.max(xLength, yLength));
    var xIndex = 0, yIndex = 0, resultIndex = 0;
    while (xIndex < xLength && yIndex < yLength) {
        if (x[xIndex] < y[yIndex]) {
            result[resultIndex++] = x[xIndex++];
        } else if (y[yIndex] < x[xIndex]) {
            result[resultIndex++] = y[yIndex++];
        } else /* x[xIndex] === y[yIndex] */ {
            result[resultIndex++] = y[yIndex++];
            xIndex++;
        }
    }
    while (xIndex < xLength) {
        result[resultIndex++] = x[xIndex++];
    }
    while (yIndex < yLength) {
        result[resultIndex++] = y[yIndex++];
    }
    return result;
};

/**
 * Returns the intersection of two sorted arrays of integers.
 * @param {Mask} x
 * @param {Mask} y
 * @returns {Mask}
 */
DataframeMask.intersectionOfTwoMasks = function(x, y) {
    var xLength = x.length, yLength = y.length;
    // Smallest result: no intersection and no output.
    var result = [];
    var xIndex = 0, yIndex = 0;
    while (xIndex < xLength && yIndex < yLength) {
        if (x[xIndex] < y[yIndex]) {
            xIndex++;
        } else if (y[yIndex] < x[xIndex]) {
            yIndex++;
        } else /* x[xIndex] === y[yIndex] */ {
            result.push(y[yIndex++]);
            xIndex++;
        }
    }
    return result;
};

/**
 * Returns the complement of a sorted array in a universe/range.
 * @param {Mask} x
 * @param {Number} sizeOfUniverse
 * @returns {Mask}
 */
DataframeMask.complementOfMask = function(x, sizeOfUniverse) {
    var xLength = x.length;
    // We know the exact length.
    var result = new Array(sizeOfUniverse - xLength);
    var xIndex = 0, complementIndex = 0, resultIndex = 0;
    // Only add complementIndex when x has no matching value.
    while (complementIndex < sizeOfUniverse) {
        // Either run past X's values or X is higher, so not found in X:
        if (xIndex === xLength || x[xIndex] > complementIndex) {
            result[resultIndex++] = complementIndex++;
        } else { // Skip this X value which is <= the current complement.
            complementIndex++;
            xIndex++;
        }
    }
    return result;
};

/**
 * Returns the intersection of the first mask and the complement of the second mask.
 * @param {Mask} x
 * @param {Mask} y
 * @returns {Mask}
 */
DataframeMask.minusMask = function (x, y) {
    var xLength = x.length, yLength = y.length;
    // Smallest result: full intersection and no output.
    var result = [];
    var xIndex = 0, yIndex = 0;
    while (xIndex < xLength && yIndex < yLength) {
        if (x[xIndex] < y[yIndex]) {
            result.push(x[xIndex++]);
        } else if (y[yIndex] < x[xIndex]) {
            yIndex++;
        } else /* x[xIndex] === y[yIndex] */ {
            yIndex++;
            xIndex++;
        }
    }
    while (xIndex < xLength) {
        result.push(x[xIndex++]);
    }
    return result;
};

/**
 * @param {DataframeMask} other
 * @returns {DataframeMask}
 */
DataframeMask.prototype.union = function (other) {
    return new DataframeMask(this.dataframe,
        DataframeMask.unionOfTwoMasks(this.point, other.point),
        DataframeMask.unionOfTwoMasks(this.edge, other.edge));
};

/**
 * @param {DataframeMask} other
 * @returns {DataframeMask}
 */
DataframeMask.prototype.intersection = function (other) {
    return new DataframeMask(this.dataframe,
        DataframeMask.intersectionOfTwoMasks(this.point, other.point),
        DataframeMask.intersectionOfTwoMasks(this.edge, other.edge));
};

/**
 * @returns {DataframeMask}
 */
DataframeMask.prototype.complement = function () {
    return new DataframeMask(this.dataframe,
        DataframeMask.complementOfMask(this.point, this.dataframe.numPoints()),
        DataframeMask.complementOfMask(this.edge, this.dataframe.numEdges()));
};

/**
 * @param {DataframeMask} other
 * @returns {DataframeMask}
 */
DataframeMask.prototype.minus = function (other) {
    return new DataframeMask(this.dataframe,
        DataframeMask.minusMask(this.point, other.point),
        DataframeMask.minusMask(this.edge, other.edge));
};

/**
 * This callback applies to iterating across point and edge index arrays.
 * @callback IndexIteratorCallback
 * @param {Number} indexAsElement
 * @param {Number} index
 * */

/**
 * @param {String} type point/edge
 * @param {IndexIteratorCallback} iterator
 */
DataframeMask.prototype.mapIndexes = function (type, iterator) {
    var numElements = this.numByType(type), i = 0;
    var mask = this[type];
    if (mask === undefined) {
        for (i = 0; i < numElements; i++) {
            iterator.call(this, i, i);
        }
    } else {
        for (i = 0; i < numElements; i++) {
            iterator.call(this, mask[i], i);
        }
    }
};

/**
 * @param {IndexIteratorCallback} iterator
 */
DataframeMask.prototype.mapPointIndexes = function (iterator) {
    this.mapIndexes('point', iterator);
};

/**
 * @param {IndexIteratorCallback} iterator
 */
DataframeMask.prototype.mapEdgeIndexes = function (iterator) {
    this.mapIndexes('edge', iterator);
};

DataframeMask.prototype.getIndexByType = function (type, index) {
    if (this[type] === undefined) {
        return index;
    } else {
        return this[type][index];
    }
};

DataframeMask.prototype.typedIndexesForType = function (type) {
    var numElements = this.numByType(type),
        result = new Uint32Array(numElements),
        i = 0,
        mask = this[type];
    if (mask === undefined) {
        for (i=0; i<numElements; i++) {
            result[i] = i;
        }
    } else {
        for (i=0; i<numElements; i++) {
            result[i] = mask[i];
        }
    }
    return result;
};

DataframeMask.prototype.typedEdgeIndexes = function () {
    return this.typedIndexesForType('edge');
};

DataframeMask.prototype.typedPointIndexes = function () {
    return this.typedIndexesForType('point');
};

DataframeMask.prototype.getEdgeIndex = function (index) {
    return this.getIndexByType('edge', index);
};

DataframeMask.prototype.getPointIndex = function (index) {
    return this.getIndexByType('point', index);
};

var OmittedProperties = ['dataframe'];

/**
 * Override to avoid serializing the dataframe or a typed array.
 * Also translates mask indexes from rawdata to data framing.
 */
DataframeMask.prototype.toJSON = function () {
    var result = _.omit(this, OmittedProperties);
    _.each(GraphComponentTypes, function (componentType) {
        if (result[componentType] !== undefined && !(result[componentType] instanceof Array)) {
            var componentMask = result[componentType];
            result[componentType] = new Array(componentMask.length);
            for (var i = 0; i < componentMask.length; i++) {
                result[componentType][i] = componentMask[i];
            }
        }
    });
    return result;
};

/**
 * No-op which might accept updated masks from a client specification.
 * @param clientMask
 */
DataframeMask.prototype.fromJSON = function (clientMask) {
    if (clientMask === undefined) { return; }
    _.each(GraphComponentTypes, function (componentType) {
        if (clientMask[componentType] !== undefined) {
            var numComponents = this.dataframe.numByType(componentType);
            var componentMask = _.filter(clientMask[componentType], function (idx) { return idx < numComponents; });
            // TODO translate to filter-independent offsets
            this[componentType] = componentMask.sort();
        }
    }.bind(this));
};

module.exports = DataframeMask;

'use strict';

var _ = require('underscore');

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
 * @constructor
 */
function DataframeMask(dataframe, pointIndexes, edgeIndexes) {
    this.dataframe = dataframe;
    this.point = (pointIndexes instanceof ArrayBuffer) ? new Uint32Array(pointIndexes) : pointIndexes;
    this.edge = (edgeIndexes instanceof ArrayBuffer) ? new Uint32Array(edgeIndexes) : edgeIndexes;
}

DataframeMask.prototype.numPoints = function () {
    return this.point !== undefined ? this.point.length : this.dataframe.numPoints();
};

DataframeMask.prototype.numByType = function (type) {
    return this[type] !== undefined ? this[type].length : this.dataframe.getNumElements(type);
};

DataframeMask.prototype.limitNumPointsTo = function (limit) {
    if (limit >= this.numPoints()) { return; }
    if (this.point === undefined) {
        this.point = _.range(limit);
    } else {
        this.point.length = limit;
    }
};

DataframeMask.prototype.numEdges = function () {
    return this.edge !== undefined ? this.edge.length : this.dataframe.numEdges();
};

DataframeMask.prototype.limitNumEdgesTo = function (limit) {
    if (limit >= this.numEdges()) { return; }
    if (this.edge === undefined) {
        this.edge = _.range(limit);
    } else {
        this.edge.length = limit;
    }
};

/**
 * Override to avoid serializing the dataframe.
 */
DataframeMask.prototype.toJSON = function () {
    if (this.dataframe === undefined) {
        return this;
    } else {
        return _.omit(this, 'dataframe');
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
 * This callback applies to iterating across point and edge index arrays.
 * @callback IndexIteratorCallback
 * @param {Number} indexAsElement
 * @param {Number} index
 * */

/**
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
    var numPoints = this.numPoints(), i = 0;
    if (this.point === undefined) {
        for (i = 0; i < numPoints; i++) {
            iterator.call(this, i, i);
        }
    } else {
        for (i = 0; i < numPoints; i++) {
            iterator.call(this, this.point[i], i);
        }
    }
};

/**
 * @param {IndexIteratorCallback} iterator
 */
DataframeMask.prototype.mapEdgeIndexes = function (iterator) {
    var numEdges = this.numEdges(), i = 0;
    if (this.edge === undefined) {
        for (i = 0; i < numEdges; i++) {
            iterator.call(this, i, i);
        }
    } else {
        for (i = 0; i < numEdges; i++) {
            iterator.call(this, this.edge[i], i);
        }
    }
};

DataframeMask.prototype.getIndexByType = function (type, index) {
    if (this[type] === undefined) {
        return index;
    } else {
        return this[type][index];
    }
};

DataframeMask.prototype.getEdgeIndex = function (index) {
    if (this.edge === undefined) {
        return index;
    } else {
        return this.edge[index];
    }
};

DataframeMask.prototype.getPointIndex = function (index) {
    if (this.point === undefined) {
        return index;
    } else {
        return this.point[index];
    }
};

var OmittedProperties = ['dataframe'];

DataframeMask.prototype.toJSON = function () {
    var result = _.omit(this, OmittedProperties);
    var i;
    if (result.edge !== undefined && !(result.edge instanceof Array)) {
        var edgeMask = result.edge;
        result.edge = new Array(edgeMask.length);
        for (i=0; i<edgeMask.length; i++) {
            result.edge[i] = edgeMask[i];
        }
    }
    if (result.point !== undefined && !(result.point instanceof Array)) {
        var pointMask = result.point;
        result.point = new Array(pointMask.length);
        for (i=0; i<pointMask.length; i++) {
            result.point[i] = pointMask[i];
        }
    }
    return result;
};

module.exports = DataframeMask;

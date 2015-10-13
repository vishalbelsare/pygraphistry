'use strict';

/**
 * Mask is implemented as a list of valid indices (in sorted order).
 * @typedef Array<Number> Mask
 */

/**
 * @typedef Array<Mask> MaskList
 */

/**
 * @param {Dataframe} dataframe
 * @param {Mask} pointIndexes
 * @param {Mask} edgeIndexes
 * @constructor
 */
function DataframeMask(dataframe, pointIndexes, edgeIndexes) {
    this.dataframe = dataframe;
    this.point = pointIndexes;
    this.edge = edgeIndexes;
}

DataframeMask.prototype.numPoints = function () {
    return this.point !== undefined ? this.point.length : this.dataframe.numPoints();
};

DataframeMask.prototype.numEdges = function () {
    return this.edge !== undefined ? this.edge.length : this.dataframe.numEdges();
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
DataframeMask.prototype.mapPointIndexes = function (iterator) {
    for (var i = 0; i < this.point.length; i++) {
        iterator.call(this, this.point[i], i);
    }
};

/**
 * @param {IndexIteratorCallback} iterator
 */
DataframeMask.prototype.mapEdgeIndexes = function (iterator) {
    for (var i = 0; i < this.edge.length; i++) {
        iterator.call(this, this.edge[i], i);
    }
};

module.exports = DataframeMask;

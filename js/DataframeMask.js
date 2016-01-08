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
 * @param {Mask} sortedArray
 * @param {Number} value
 * @returns {Number}
 */
function indexOfInSorted(sortedArray, value) {
    var low = 0,
        high = sortedArray.length - 1,
        mid;
    while (low < high) {
        mid = Math.floor((low + high) / 2);
        if (sortedArray[mid] > value) {
            high = mid - 1;
        } else if (sortedArray[mid] < value) {
            low = mid + 1;
        } else {
            return mid;
        }
    }
    return -1;
}

/**
 * @param {Dataframe} dataframe
 * @param {Mask} pointIndexes Sorted list of indexes into the raw points data. If undefined, means all indexes.
 * @param {Mask} edgeIndexes Sorted list of indexes into the raw edges data. If undefined, means all indexes.
 * @param {DataframeMask?} basis Another DataframeMask which the input indexes refer to.
 * @constructor
 */
function DataframeMask(dataframe, pointIndexes, edgeIndexes, basis) {
    this.dataframe = dataframe;
    /** Boolean for whether untouched/undefined masks mean empty vs full. */
    this.isExclusive = false;
    var pointMask = pointIndexes;
    var edgeMask = edgeIndexes;
    if (basis) {
        pointMask = unbaseMaskFrom(pointMask, basis.point);
        edgeMask = unbaseMaskFrom(edgeMask, basis.edge);
    }
    if (pointMask instanceof ArrayBuffer) { pointMask = new Uint32Array(pointMask); }
    if (edgeMask instanceof ArrayBuffer) { edgeMask = new Uint32Array(edgeMask); }
    this.point = pointMask;
    this.edge = edgeMask;
}


/**
 * This translates the input mask from a basis-coordinate system to a global coordinate system.
 * @param {Mask} mask The mask to translate.
 * @param {Mask} basisMask The existing mask that the input mask indexes refer to.
 * @returns {Mask}
 */
function unbaseMaskFrom (mask, basisMask) {
    if (mask !== undefined && basisMask !== undefined) {
        var globalizedMask = new Uint32Array(mask.length);
        for (var i=0; i<mask.length; i++) {
            globalizedMask[i] = basisMask[mask[i]];
        }
        return globalizedMask;
    } else {
        return mask;
    }
}

/**
 * This translates and filters the input mask from a global-coordinate system to a basis-coordinate system.
 * This is like intersection, but the result mask values indicate the index of the found value in the basis.
 * @param {Mask} mask The mask to translate.
 * @param {Mask} basisMask The mask in which the input should be re-rendered.
 * @returns {Mask}
 */
function baseMaskOn (mask, basisMask) {
    if (mask !== undefined && basisMask !== undefined) {
        var maskLength = mask.length, basisLength = basisMask.length;
        // Smallest result: no intersection and no output.
        var localizedMask = [];
        var maskIndex = 0, basisIndex = 0;
        while (maskIndex < maskLength && basisIndex < basisLength) {
            if (mask[maskIndex] < basisMask[basisIndex]) {
                maskIndex++;
            } else if (basisMask[basisIndex] < mask[maskIndex]) {
                basisIndex++;
            } else /* mask[maskIndex] === basisMask[basisIndex] */ {
                localizedMask.push(basisIndex++);
                maskIndex++;
            }
        }
        return localizedMask;
    } else {
        return mask;
    }
}


/**
 * Returns the union of two sorted arrays of integers.
 * @param {Mask} x
 * @param {Mask} y
 * @returns {Mask}
 */
DataframeMask.unionOfTwoMasks = function(x, y) {
    // Undefined means pass-through:
    if (x === undefined || y === undefined) { return undefined; }
    var xLength = x.length, yLength = y.length;
    // Smallest result: one is a subset of the other.
    var result = new Array(Math.floor(Math.max(xLength, yLength)));
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
    // Undefined means pass-through:
    if (x === undefined) { return y; }
    if (y === undefined) { return x; }
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
    // Undefined means all, complement is empty:
    if (x === undefined) { return []; }
    if (x === []) { return undefined; }
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
 * @param {Number} sizeOfUniverse only needed when undefined might be passed
 * @returns {Mask}
 */
DataframeMask.minusMask = function (x, y, sizeOfUniverse) {
    // The universe minus something is the complement:
    if (x === undefined) { return DataframeMask.complementOfMask(y, sizeOfUniverse); }
    // The complement of the universe is empty:
    if (y === undefined) { return []; }
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
 * Returns the intersection of x and y, x-y, and y-x.
 * @param {Mask} x
 * @param {Mask} y
 * @returns {Object.<Mask>}
 */
DataframeMask.diffMask = function (x, y) {
    // Smallest results: full intersection and no output on each count.
    var result = {xOnly: [], intersection: [], yOnly: []};
    var xLength = x.length, yLength = y.length;
    var xIndex = 0, yIndex = 0;
    while (xIndex < xLength && yIndex < yLength) {
        if (x[xIndex] < y[yIndex]) {
            result.xOnly.push(x[xIndex++]);
        } else if (y[yIndex] < x[xIndex]) {
            result.yOnly.push(y[yIndex++]);
        } else /* x[xIndex] === y[yIndex] */ {
            result.intersection.push(y[yIndex++]);
            xIndex++;
        }
    }
    while (xIndex < xLength) {
        result.xOnly.push(x[xIndex++]);
    }
    while (yIndex < yLength) {
        result.yOnly.push(y[yIndex++]);
    }
    return result;
};

var OmittedProperties = ['dataframe'];


DataframeMask.prototype = {
    numByType: function (type) {
        return this[type] !== undefined ? this[type].length : this.dataframe.getOriginalNumElements(type);
    },

    isEmpty: function () {
        return this.numPoints() === 0 && this.numEdges() === 0;
    },

    setExclusive: function (exclusive) {
        this.isExclusive = exclusive;
    },

    /**
     * @param {DataframeMask} other
     * @returns {Boolean}
     */
    equals: function (other) {
        var that = this;

        // Quick test on sizes.
        if (this.numPoints() !== other.numPoints() || this.numEdges() !== other.numEdges()) {
            return false;
        }

        // If sizes are same, iterate through to make sure.
        var isSame = true;
        _.each(['point', 'edge'], function (type) {
            that.mapIndexes(type, function (idx, i) {
                if (other.getIndexByType(type, i) !== idx) {
                    isSame = false;
                }
            });
        });
        return isSame;
    },

    numPoints: function () {
        return this.numByType('point');
    },

    numEdges: function () {
        return this.numByType('edge');
    },

    maskSize: function () {
        return {point: this.numPoints(), edge: this.numEdges()};
    },

    limitNumByTypeTo: function (type, limit) {
        if (limit >= this.numByType(type)) { return; }
        if (this[type] === undefined) {
            this[type] = _.range(limit);
        } else {
            this[type].length = limit;
        }
    },

    /**
     * @param {DataframeMask} other
     */
    assertSameDataframe: function (other) {
        if (other.dataframe !== this.dataframe) {
            throw new Error('Support for working with masks across dataframes is not yet implemented.');
        }
    },

    getMaskForType: function (type) {
        if (this[type] === undefined && this.isExclusive) {
            return [];
        }
        return this[type];
    },

    /**
     * @param {String} type point/edge
     * @param {DataframeMask} other
     * @returns {Mask}
     */
    unionForType: function (type, other) {
        return DataframeMask.unionOfTwoMasks(this.getMaskForType(type), other.getMaskForType(type));
    },

    /**
     * @param {DataframeMask} other
     * @returns {DataframeMask}
     */
    union: function (other) {
        this.assertSameDataframe(other);
        return new DataframeMask(this.dataframe,
            this.unionForType(GraphComponentTypes[0], other),
            this.unionForType(GraphComponentTypes[1], other));
    },

    /**
     * @param {String} type point/edge
     * @param {DataframeMask} other
     * @returns {Mask}
     */
    intersectionForType: function (type, other) {
        return DataframeMask.intersectionOfTwoMasks(this.getMaskForType(type), other.getMaskForType(type));
    },

    /**
     * @param {DataframeMask} other
     * @returns {DataframeMask}
     */
    intersection: function (other) {
        this.assertSameDataframe(other);
        return new DataframeMask(this.dataframe,
            this.intersectionForType(GraphComponentTypes[0], other),
            this.intersectionForType(GraphComponentTypes[1], other));
    },

    /**
     * @returns {DataframeMask}
     */
    complement: function () {
        var result = new DataframeMask(this.dataframe,
            DataframeMask.complementOfMask(this.getMaskForType('point'), this.dataframe.numPoints()),
            DataframeMask.complementOfMask(this.getMaskForType('edge'), this.dataframe.numEdges()));
        result.setExclusive(!this.isExclusive);
        return result;
    },

    /**
     * @param {DataframeMask} other
     * @returns {DataframeMask}
     */
    minus: function (other) {
        this.assertSameDataframe(other);
        return new DataframeMask(this.dataframe,
            DataframeMask.minusMask(this.getMaskForType('point'), other.getMaskForType('point'), this.dataframe.numPoints()),
            DataframeMask.minusMask(this.getMaskForType('edge'), other.getMaskForType('edge'), this.dataframe.numEdges()));
    },

    /**
     * @param {DataframeMask} other
     * @returns {{dataframe: Dataframe, point: Object.<Mask>, edge: Object.<Mask>}}
     */
    diff: function (other) {
        this.assertSameDataframe(other);
        return {
            dataframe: this.dataframe,
            point: DataframeMask.diffMask(this.getMaskForType('point'), other.getMaskForType('point')),
            edge: DataframeMask.diffMask(this.getMaskForType('edge'), other.getMaskForType('edge'))
        };
    },

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
    mapIndexes: function (type, iterator) {
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
    },

    /**
     * @param {IndexIteratorCallback} iterator
     */
    mapPointIndexes: function (iterator) {
        this.mapIndexes('point', iterator);
    },

    /**
     * @param {IndexIteratorCallback} iterator
     */
    mapEdgeIndexes: function (iterator) {
        this.mapIndexes('edge', iterator);
    },

    getIndexByType: function (type, index) {
        if (this[type] === undefined) {
            return index;
        } else {
            return this[type][index];
        }
    },

    toString: function () {
        return JSON.stringify(_.omit(this, OmittedProperties), null, 4);
    },

    typedIndexesForType: function (type) {
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
    },

    typedEdgeIndexes: function () {
        return this.typedIndexesForType('edge');
    },

    typedPointIndexes: function () {
        return this.typedIndexesForType('point');
    },

    contains: function (type, index) {
        if (this[type] === undefined) {
            return index > 0 && index < this.dataframe.numByType(type);
        } else {
            return indexOfInSorted(this[type], index) !== -1;
        }
    },

    /**
     * Override to avoid serializing the dataframe or a typed array.
     * Also translates mask indexes from rawdata to data framing.
     * @param {DataframeMask} basisMask
     */
    toJSON: function (basisMask) {
        var result = _.omit(this, OmittedProperties);
        _.each(GraphComponentTypes, function (componentType) {
            var componentMask = result[componentType];
            if (basisMask) {
                componentMask = baseMaskOn(componentMask, basisMask[componentType]);
            }
            if (componentMask !== undefined && !(componentMask instanceof Array)) {
                result[componentType] = new Array(componentMask.length);
                for (var i = 0; i < componentMask.length; i++) {
                    result[componentType][i] = componentMask[i];
                }
            }
        });
        return result;
    },

    /**
     * No-op which might accept updated masks from a client specification.
     * @param clientMask
     */
    fromJSON: function (clientMask) {
        if (clientMask === undefined) { return; }
        _.each(GraphComponentTypes, function (componentType) {
            if (clientMask[componentType] !== undefined) {
                var numComponents = this.dataframe.numByType(componentType);
                var componentMask = _.filter(clientMask[componentType], function (idx) { return idx < numComponents; });
                // TODO translate to filter-independent offsets
                this[componentType] = componentMask.sort();
            }
        }.bind(this));
    }
};

module.exports = DataframeMask;

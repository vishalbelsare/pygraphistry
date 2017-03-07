'use strict';

const _ = require('underscore');

// Duplicated from Dataframe.js
const GraphComponentTypes = ['point', 'edge'];

/**
 * Mask represents a selection of index values in an enumerated space.
 * Implemented as a list of valid indices (in sorted order).
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
function indexOfInSorted (sortedArray, value) {
    let low = 0,
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
function DataframeMask (dataframe, pointIndexes = undefined, edgeIndexes = undefined, basis = undefined) {
    this.dataframe = dataframe;
    /** Boolean for whether untouched/undefined masks mean empty vs full. */
    this.isExclusive = false;
    let pointMask = pointIndexes;
    let edgeMask = edgeIndexes;
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
DataframeMask.unbaseMaskFrom = unbaseMaskFrom;

function unbaseMaskFrom (mask, basisMask) {
    if (mask !== undefined && basisMask !== undefined) {
        const globalizedMask = new Uint32Array(mask.length);
        for (let i=0; i<mask.length; i++) {
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
DataframeMask.baseMaskOn = baseMaskOn;

function baseMaskOn (mask, basisMask) {
    if (mask !== undefined && basisMask !== undefined) {
        const maskLength = mask.length, basisLength = basisMask.length;
        // Smallest result: no intersection and no output.
        const localizedMask = [];
        let maskIndex = 0, basisIndex = 0;
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
DataframeMask.unionOfTwoMasks = function (x, y) {
    // Undefined means pass-through:
    if (x === undefined || y === undefined) { return undefined; }
    const xLength = x.length, yLength = y.length;
    // Smallest result: one is a subset of the other.
    const result = new Array(Math.floor(Math.max(xLength, yLength)));
    let xIndex = 0, yIndex = 0, resultIndex = 0;
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
DataframeMask.intersectionOfTwoMasks = function (x, y) {
    // Undefined means pass-through:
    if (x === undefined) { return y; }
    if (y === undefined) { return x; }
    const xLength = x.length, yLength = y.length;
    // Smallest result: no intersection and no output.
    const result = [];
    let xIndex = 0, yIndex = 0;
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
DataframeMask.complementOfMask = function (x, sizeOfUniverse) {
    // Undefined means all, complement is empty:
    if (x === undefined) { return []; }
    if (x === []) { return undefined; }
    const xLength = x.length;
    // We know the exact length.
    const result = new Array(sizeOfUniverse - xLength);
    let xIndex = 0, complementIndex = 0, resultIndex = 0;
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
    const xLength = x.length, yLength = y.length;
    // Smallest result: full intersection and no output.
    const result = [];
    let xIndex = 0, yIndex = 0;
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
    const result = {xOnly: [], intersection: [], yOnly: []};
    const xLength = x.length, yLength = y.length;
    let xIndex = 0, yIndex = 0;
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

const NonSerializableProperties = ['dataframe'];


DataframeMask.prototype = {
    numByType: function (type) {
        return this[type] !== undefined ? this[type].length : this.dataframe.getOriginalNumElements(type);
    },

    isEmptyByType: function (type) {
        return this.numByType(type) === 0;
    },

    isEmpty: function () {
        return this.numPoints() === 0 && this.numEdges() === 0;
    },

    setExclusive: function (exclusive) {
        this.isExclusive = exclusive;
    },

    /**
     * @param {GraphComponentTypes} type
     * @param {DataframeMask} other
     * @returns {Boolean}
     */
    equalsMaskOnType: function (type, other) {
        let isSame = true;
        this.forEachIndexByType(type, (idx, i) => {
            if (other.getIndexByType(type, i) !== idx) {
                isSame = false;
                return false;
            }
            return undefined;
        });
        return isSame;
    },

    /**
     * @param {DataframeMask} other
     * @returns {Boolean}
     */
    equalsMask: function (other) {
        if (this === other) {
            return true;
        }
        // Quick test on sizes.
        if (_.any(GraphComponentTypes, (type) => this.numByType(type) !== other.numByType(type))) {
            return false;
        }

        // If sizes are same, iterate through to make sure.
        let isSame = true;
        _.each(GraphComponentTypes, (type) => {
            isSame = isSame && this.equalsMaskOnType(type, other);
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
        if (other !== undefined && other.dataframe !== this.dataframe) {
            throw new Error('Support for working with masks across dataframes is not yet implemented.');
        }
    },

    getMaskForType: function (type) {
        if (this[type] === undefined && this.isExclusive) {
            return [];
        }
        return this[type];
    },

    getIndexRangeByType: function (type, start, end) {
        if (this[type] === undefined) {
            if (this.isExclusive) {
                throw new Error('taking a slice of an exclusive range not yet defined');
            } else {
                return _.range(start, end);
            }
        } else {
            return this[type].slice(start, end);
        }
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
        if (other === undefined) {
            return this;
        }
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
        const result = new DataframeMask(this.dataframe,
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
     * @param {GraphComponentTypes} type
     * @param {IndexIteratorCallback} iterator Returning a value terminates iteration early.
     */
    forEachIndexByType: function (type, iterator) {
        const numElements = this.numByType(type);
        const mask = this[type];
        if (mask === undefined) {
            if (this.isExclusive) { return; }
            for (let i = 0; i < numElements; i++) {
                if (iterator.call(this, i, i) !== undefined) { return; }
            }
        } else {
            for (let i = 0; i < numElements; i++) {
                if (iterator.call(this, mask[i], i) !== undefined) { return; }
            }
        }
    },

    /** Calls the iterator for every index possible along with a boolean whether it is in the mask.
     * @param type
     * @param numByType
     * @param iterator
     */
    forEachUnderlyingIndexByType: function (type, numByType, iterator) {
        const mask = this[type];
        if (mask === undefined) {
            const allIndexesAreIn = !this.isExclusive;
            for (let i = 0; i < numByType; i++) {
                iterator.call(this, i, allIndexesAreIn);
            }
        } else {
            let maskIndex = 0;
            for (let i = 0; i < numByType; i++) {
                const isIn = maskIndex < mask.length && mask[maskIndex] === i;
                if (isIn) {
                    maskIndex++;
                }
                iterator.call(this, i, isIn);
            }
        }
    },

    mapIndexesByType: function (type, iterator) {
        const numElements = this.numByType(type);
        const results = new Array(numElements);
        this.forEachIndexByType(type, (index, i) => {
            results[i] = iterator(index, i);
        });
        return results;
    },

    /**
     * @param {IndexIteratorCallback} iterator
     */
    forEachPointIndex: function (iterator) {
        this.forEachIndexByType('point', iterator);
    },

    /**
     * @param {IndexIteratorCallback} iterator
     */
    forEachEdgeIndex: function (iterator) {
        this.forEachIndexByType('edge', iterator);
    },

    getIndexByType: function (type, index) {
        if (this[type] === undefined) {
            return index;
        } else {
            return this[type][index];
        }
    },

    toString: function () {
        return JSON.stringify(_.omit(this, NonSerializableProperties), null, 4);
    },

    typedIndexesForType: function (type) {
        const numElements = this.numByType(type),
            result = new Uint32Array(numElements),
            mask = this[type];
        if (mask === undefined) {
            for (let i=0; i<numElements; i++) {
                result[i] = i;
            }
        } else {
            for (let i=0; i<numElements; i++) {
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
        const result = _.omit(this, NonSerializableProperties);
        _.each(GraphComponentTypes, (componentType) => {
            let componentMask = result[componentType];
            if (basisMask) {
                componentMask = baseMaskOn(componentMask, basisMask[componentType]);
            }
            if (componentMask !== undefined && !(componentMask instanceof Array)) {
                result[componentType] = new Array(componentMask.length);
                for (let i = 0; i < componentMask.length; i++) {
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
        _.each(GraphComponentTypes, (componentType) => {
            if (clientMask[componentType] !== undefined) {
                const numComponents = this.dataframe.numByType(componentType);
                const componentMask = _.filter(clientMask[componentType], (idx) => idx < numComponents);
                // TODO translate to filter-independent offsets
                this[componentType] = componentMask.sort();
            }
        });
    }
};

export default DataframeMask;

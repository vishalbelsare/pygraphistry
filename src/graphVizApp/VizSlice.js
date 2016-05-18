'use strict';

var _ = require('underscore');

var DimCodes = {
    point: 1,
    edge: 2
};

/**
 * @typedef {Object} VizSliceElement
 * @property {Number} dim - Enum: 1 for point, 2 for edge.
 * @property {Number} idx - Index into the filtered dataframe.
 * @property {String} source - whether from canvas click, etc.
 */

/**
 * @param {{point: Number[], edge: Number[], selections: VizSliceElement[]}} specification
 * @constructor
 */
function VizSlice (specification) {
    if (specification === undefined) { return; }
    /** @type {ArrayBuffer|Number[]} */
    this.point = specification.point;
    /** @type {ArrayBuffer|Number[]} */
    this.edge = specification.edge;
    if (_.isArray(specification)) {
        this.separateItems = specification;
    } else if (_.isArray(specification.separateItems)) {
        /** @type {ArrayBuffer|Number[]} */
        this.separateItems = specification.separateItems;
    }
}

/**
 * Modifies the array as a sorted set to toggle the value in/out. Returns the index of the value once effected,
 * along with the array itself (in case a new array had to be instantiated)
 * @param {Number[]} arrayData
 * @param {Number} newValue
 * @returns {Number}
 */
function removeOrAddFromSortedArray(arrayData, newValue) {
    if (arrayData === undefined) { return [newValue]; }

    // Guard for if the array is arraylike, but not array
    // This is the case for arguments, as well as typed arrays
    // We do this because we need access to the push() method
    if (arrayData.constructor !== Array) {
        arrayData = Array.prototype.slice.call(arrayData);
    }

    const idxInSorted = indexOfInSorted(arrayData, newValue);
    let idx = -1;
    if (idxInSorted >= 0) {
        arrayData.splice(idxInSorted, 1);
    } else {
        const idxItShouldBeInArray = indexOfElementAfterInSorted(arrayData, newValue);
        if (idxItShouldBeInArray < arrayData.length) {
            arrayData.splice(idxItShouldBeInArray, 0, newValue);
            idx = idxItShouldBeInArray;
        } else {
            arrayData.push(newValue);
            idx = arrayData.length - 1;
        }
    }

    return {
        idx, values: arrayData
    };
}

function indexOfElementAfterInSorted (sortedArray, value) {
    var low = 0,
        high = sortedArray.length - 1,
        mid;
    while (low <= high) {
        mid = Math.floor((low + high) / 2);
        if (sortedArray[mid] > value) {
            high = mid - 1;
        } else if (sortedArray[mid] < value) {
            low = mid + 1;
        } else {
            return mid;
        }
    }
    return low; // low is now the element after where value should be
}

function indexOfInSorted(sortedArray, value) {
    var low = 0,
        high = sortedArray.length - 1,
        mid;
    while (low <= high) {
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

function removeOrAddFromUnsortedArray(arrayData, newElem, equalityFunc) {
    if (arrayData === undefined) { return [newElem]; }

    // Guard for if the array is arraylike, but not array
    // This is the case for arguments, as well as typed arrays
    // We do this because we need access to the push() method
    if (arrayData.constructor !== Array) {
        arrayData = Array.prototype.slice.call(arrayData);
    }

    var lengthBefore = arrayData.length,
        result = arrayData;

    // Remove elements if they exist.
    result = _.map(result, function (elem) {
        if (equalityFunc(elem, newElem)) {
            return null;
        }
        return elem;
    });

    result = result.filter(function (val) {
        return (val !== null);
    });

    // Add new elements if it didn't exist;
    if (lengthBefore === result.length) {
        result.push(newElem);
    }

    return result;
}

VizSlice.prototype = {
    isEmpty: function () {
        if (this.point !== undefined && this.point.length > 0) {
            return false;
        } else if (this.edge !== undefined && this.edge.length > 0) {
            return false;
        } else {
            return !(_.isArray(this.selection) && this.selection.length > 0);
        }
    },

    size: function () {
        var result = 0;
        if (this.point !== undefined) { result += this.point.length; }
        if (this.edge !== undefined) { result += this.edge.length; }
        if (this.separateItems !== undefined) { result += this.separateItems.length; }
        return result;
    },

    newFrom: function (specification) {
        return new VizSlice(specification);
    },

    newEmpty: function () {
        return new VizSlice();
    },

    newAdding: function (newElements) {
        var existingItems = this.separateItems,
            resultItems = existingItems;
        if (_.isArray(existingItems)) {
            resultItems = existingItems.concat(newElements);
        }
        return new VizSlice({edge: this.edge, point: this.point, separateItems: resultItems});
    },

    copy: function () {
        return this.newFrom(this);
    },

    _isMaskShaped: function () {
        return !_.isArray(this.separateItems);
    },

    containsIndexByDim: function (idx, dim) {
        switch (dim) {
            case DimCodes.point:
                if (this.point !== undefined && indexOfInSorted(this.point, idx) > -1) {
                    return true;
                }
                break;
            case DimCodes.edge:
                if (this.edge !== undefined && indexOfInSorted(this.edge, idx) > -1) {
                    return true;
                }
                break;
        }
        return _.find(this.separateItems, function (separateItem) {
            return separateItem.dim === dim && separateItem.idx === idx;
        }) !== undefined;
    },

    getPointIndexValues: function () {
        if (this._isMaskShaped()) {
            return this.point || [];
        } else {
            return _.pluck(_.where(this.separateItems, {dim: 1}), 'idx');
        }
    },

    getEdgeIndexValues: function () {
        if (this._isMaskShaped()) {
            return this.edge || [];
        } else {
            return _.pluck(_.filter(this.separateItems, {dim: 2}), 'idx');
        }
    },

    tagSourceAs: function (source) {
        this.source = source;
        _.each(this.separateItems, function (sliceElement) { sliceElement.source = source; });
    },

    getPrimaryManualElement: function () {
        return this.separateItems.length > 0 ? this.separateItems[0] : undefined;
    },

    /**
     * @returns {VizSliceElement[]}
     */
    getVizSliceElements: function () {
        return this._isMaskShaped() ? [] : this.separateItems;
    },

    /**
     * Polymorphic iterator over the various representations of selections allocating minimal memory.
     * @param iterator Takes index and dimension (1=point, 2=edge)
     */
    forEachIndexAndDim: function (iterator) {
        var i = 0;
        if (this.point !== undefined) {
            for (i=0; i<this.point.length; i++) {
                iterator(this.point[i], 1);
            }
        }
        if (this.edge !== undefined) {
            for (i=0; i<this.edge.length; i++) {
                iterator(this.edge[i], 2);
            }
        }
        if (this.separateItems && _.isArray(this.separateItems)) {
            for (i=0; i<this.separateItems.length; i++) {
                iterator(this.separateItems[i].idx, this.separateItems[i].dim);
            }
        }
    },

    /**
     *
     * @param {VizSliceElement} selection
     */
    removeOrAdd: function (selection) {
        var result = this.copy();
        if (this._isMaskShaped()) {
            switch (selection.dim) {
                case DimCodes.point:
                    result.point = removeOrAddFromSortedArray(result.point, selection.idx).values;
                    break;
                case DimCodes.edge:
                    result.edge = removeOrAddFromSortedArray(result.edge, selection.idx).values;
                    break;
            }
        } else {
            result.separateItems = removeOrAddFromUnsortedArray(result.separateItems, selection, function (a, b) {
                return a.dim === b.dim && a.idx === b.idx;
            });
        }
        return result;
    }
};

module.exports = VizSlice;

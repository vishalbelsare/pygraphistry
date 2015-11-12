'use strict';

var _ = require('underscore');

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
 * Modifies the array as a sorted set to toggle the value in/out. Returns the index of the value once effected.
 * @param {Number[]} arrayData
 * @param {Number} newValue
 * @returns {Number}
 */
function removeOrAddFromSortedArray(arrayData, newValue) {
    if (arrayData === undefined) { return [newValue]; }
    var low = 0,
        high = arrayData.length - 1,
        mid;
    while (low < high) {
        mid = Math.floor((low + high) / 2);
        if (arrayData[mid] > newValue) {
            high = mid - 1;
        } else if (arrayData[mid] < newValue) {
            low = mid + 1;
        } else {
            arrayData.splice(mid, 1);
            return undefined;
        }
    }
    arrayData.push(newValue);
    return arrayData.length - 1;
}

function removeOrAddFromUnsortedArray(arrayData, newElem, equalityFunc) {
    if (arrayData === undefined) { return [newElem]; }
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
                case 1:
                    result.point = removeOrAddFromSortedArray(result.point, selection.idx);
                    break;
                case 2:
                    result.edge = removeOrAddFromSortedArray(result.edge, selection.idx);
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

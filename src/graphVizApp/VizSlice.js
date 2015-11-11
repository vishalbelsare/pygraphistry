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
        this.selections = specification;
    } else if (_.isArray(specification.selections)) {
        /** @type {ArrayBuffer|Number[]} */
        this.selections = specification.selections;
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
        if (this.selections !== undefined) { result += this.selections.length; }
        return result;
    },

    newFrom: function (specification) {
        return new VizSlice(specification);
    },

    newEmpty: function () {
        return new VizSlice();
    },

    newAdding: function (newElements) {
        var existingSelections = this.selections,
            resultSelections = existingSelections;
        if (_.isArray(existingSelections)) {
            resultSelections = existingSelections.concat(newElements);
        }
        return new VizSlice({edge: this.edge, point: this.point, selections: resultSelections});
    },

    copy: function () {
        return this.newFrom(this);
    },

    _isMaskShaped: function () {
        return !_.isArray(this.selections);
    },

    getPointIndexValues: function () {
        if (this._isMaskShaped()) {
            return this.point || [];
        } else {
            return _.pluck(_.filter(this.selections, function (sel) { return sel.dim === 1; }), 'idx');
        }
    },

    getEdgeIndexValues: function () {
        if (this._isMaskShaped()) {
            return this.edge || [];
        } else {
            return _.pluck(_.filter(this.selections, function (sel) { return sel.dim === 2; }), 'idx');
        }
    },

    /**
     * @returns {VizSliceElement[]}
     */
    getVizSliceElements: function () {
        return this._isMaskShaped() ? [] : this.selections;
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
        if (this.selections && _.isArray(this.selections)) {
            for (i=0; i<this.selections.length; i++) {
                iterator(this.selections[i].idx, this.selections[i].dim);
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
            result.selections = removeOrAddFromUnsortedArray(result.selections, selection, function (a, b) {
                return a.dim === b.dim && a.idx === b.idx;
            });
        }
        return result;
    }
};

module.exports = VizSlice;

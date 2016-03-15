'use strict';

var _       = require('underscore');
var util    = require('./util.js');


function getDegree(forwardsEdges, backwardsEdges, i) {
    return forwardsEdges.degreesTyped[i] + backwardsEdges.degreesTyped[i];
}


// Required fields in an encoding
//
// key: name of resulting local buffer
// arrType: constructor for typed array
// numberPerGraphComponent: Number of elements in resulting array relative to number
//      of input graphComponentType. E.g., edge colors have twice as many as number of edges
// graphComponentType: 'point' | 'edge'
// dependencies: What buffers the encoding needs to construct itself. Represented as
//      an array of arrays, showing namespace + name. These will be passed into the
//      generator function.
// generatorFunc: Function to produce encoded buffer. Takes in dependencies as arguments,
//      numberOfGraphElements, and index requested
//      then an output array of the appropriate size, and the number of graphType elements.
//

// TODO: Treat encodings as separate from computed columns as far as dataframe
// stacking goes. Adding/changing computed col should impact only the newest dataframe
// frame, but changing encoding should impact everything.

var defaultLocalBuffers = {

    pointColors: {
        arrType: Uint32Array,
        type: 'color',
        filterable: true,
        numberPerGraphComponent: 1,
        graphComponentType: 'point',
        version: 0,
        dependencies: [
            ['forwardsEdges', 'hostBuffer'],
            ['backwardsEdges', 'hostBuffer']
        ],
        computeAllValues: function (forwardsEdges, backwardsEdges, outArr, numGraphElements) {

            console.log('COMPUTING POINT COLORS');

            //use hash of highest degree neighbor
            var compare = function (initBest, buffers, i) {
                var best = initBest;

                var worklist = buffers.srcToWorkItem[i];
                var firstEdge = buffers.workItemsTyped[i * 4];
                var numEdges = buffers.workItemsTyped[i * 4 + 1];
                for (var j = 0; j < numEdges; j++) {
                    var dst = buffers.edgesTyped[firstEdge*2 + j*2 + 1];
                    var degree = getDegree(forwardsEdges, backwardsEdges, dst);
                    if (   (degree > best.degree)
                        || (degree == best.degree && dst > best.id)) {
                        best = {id: dst, degree: degree};
                    }
                }

                return best;
            };

            var palette = util.palettes.qual_palette2;
            var pLen = palette.length;

            for (var idx = 0; idx < numGraphElements; idx++) {
                var best = {id: idx, degree: getDegree(forwardsEdges, backwardsEdges, idx)};
                var bestOut = compare(best, forwardsEdges, idx);
                var bestIn = compare(bestOut, backwardsEdges, idx);
                var color = palette[bestIn.id % pLen];
                outArr[idx] = color;
            }

            return outArr;
        }
    },

    edgeColors: {
        arrType: Uint32Array,
        type: 'color',
        filterable: true,
        numberPerGraphComponent: 2,
        graphComponentType: 'edge',
        version: 0,
        dependencies: [
            ['forwardsEdges', 'hostBuffer'],
            ['pointColors', 'localBuffer']
        ],

        computeAllValues: function (forwardsEdges, pointColors, outArr, numGraphElements) {

            console.log('COMPUTING EDGE COLORS');
            var edgesTyped = forwardsEdges.edgesTyped;

            for (var idx = 0; idx < outArr.length; idx++) {
                var nodeIdx = edgesTyped[idx];
                outArr[idx] = pointColors[nodeIdx];
            }

            return outArr;

            // var firstNodeIdx = unsortedEdges[idx*2];
            // var secondNodeIdx = unsortedEdges[idx*2 + 1];
            // var outputArray = [pointColors[firstNodeIdx], pointColors[secondNodeIdx]];
            // return outputArray;

        }

    },

    pointSizes: {
        arrType: Uint8Array,
        type: 'number',
        filterable: true,
        numberPerGraphComponent: 1,
        graphComponentType: 'point',
        version: 0,
        dependencies: [
            ['forwardsEdges', 'hostBuffer'],
            ['backwardsEdges', 'hostBuffer']
        ],
        computeAllValues: function (forwardsEdges, backwardsEdges, outArr, numGraphElements) {

            var minDegree = Number.MAX_VALUE;
            var maxDegree = 0;
            for (var i = 0; i < numGraphElements; i++) {
                var degree = getDegree(forwardsEdges, backwardsEdges, i);
                minDegree = Math.min(minDegree, degree);
                maxDegree = Math.max(maxDegree, degree);
            }

            var offset = 5 - minDegree;
            var scalar = 20 / Math.max((maxDegree - minDegree),1);

            for (var i = 0; i < numGraphElements; i++) {
                var degree = getDegree(forwardsEdges, backwardsEdges, i);
                outArr[i] = (degree + offset) + (degree - minDegree) * scalar;
            }

            return outArr;
        }
    },

    edgeHeights: {
        arrType: Float32Array,
        type: 'number',
        filterable: true,
        numberPerGraphComponent: 2,
        graphComponentType: 'edge',
        version: 0,
        dependencies: [

        ],
        computeSingleValue: function (idx, numGraphElements) {
            // TODO: Do we need this?
            return 0;
        }
    }

};


var defaultHostBuffers = {

    forwardsEdgeWeights: {
        arrType: Float32Array,
        type: 'number',
        filterable: true,
        numberPerGraphComponent: 1,
        graphComponentType: 'edge',
        version: 0,
        dependencies: [
        ],
        computeAllValues: function (outArr, numGraphElements) {
            for (var i = 0; i < outArr.length; i++) {
                outArr[i] = 1.0;
            }
            return outArr;
        }
    },

    backwardsEdgeWeights: {
        arrType: Float32Array,
        type: 'number',
        filterable: true,
        numberPerGraphComponent: 1,
        graphComponentType: 'edge',
        version: 0,
        dependencies: [
        ],
        computeAllValues: function (outArr, numGraphElements) {
            for (var i = 0; i < outArr.length; i++) {
                outArr[i] = 1.0;
            }
            return outArr;
        }
    },

};


var defaultPointColumns = {

    /*

    doubleCloseness: {
        arrType: Array,
        type: 'number',
        filterable: true,
        numberPerGraphComponent: 1,
        graphComponentType: 'point',
        version: 0,
        dependencies: [
            ['closeness', 'point']
        ],
        computeSingleValue: function (closeness, idx, numGraphElements) {
            // TODO: Do we need this?
            return closeness * 2;
        }
    },

    doubleDoubleCloseness: {
        arrType: Array,
        type: 'number',
        filterable: true,
        numberPerGraphComponent: 1,
        graphComponentType: 'point',
        version: 0,
        dependencies: [
            ['doubleCloseness', 'point']
        ],
        computeSingleValue: function (doubleCloseness, idx, numGraphElements) {
            // TODO: Do we need this?
            return doubleCloseness * 2;
        }
    }

    */

};

// TODO: Allow users to specify which view to pull dependencies from.
var defaultColumns = {
    point: defaultPointColumns,
    hostBuffer: defaultHostBuffers
};

var defaultEncodingColumns = {
    localBuffer: defaultLocalBuffers
};

function ComputedColumnManager () {
    this.activeComputedColumns = {};
}

// TODO: Instead of using generic JSON blobs, make computed col desc a class.
ComputedColumnManager.prototype.addComputedColumn = function (dataframe, columnType, columnName, desc) {
    this.activeComputedColumns[columnType] = this.activeComputedColumns[columnType] || {};
    this.activeComputedColumns[columnType][columnName] = desc;
    dataframe.registerNewComputedColumn(this, columnType, columnName);
};


ComputedColumnManager.prototype.loadDefaultColumns = function () {
    var that = this;

    // copy in defaults. Copy so we can recover defaults when encodings change
    _.each(defaultColumns, function (cols, colType) {
        that.activeComputedColumns[colType] = that.activeComputedColumns[colType] || {};

        _.each(cols, function (colDesc, name) {
            that.activeComputedColumns[colType][name] = colDesc;
        });

    });

};


ComputedColumnManager.prototype.loadEncodingColumns = function () {
    var that = this;

    // copy in defaults. Copy so we can recover defaults when encodings change
    _.each(defaultEncodingColumns, function (cols, colType) {
        that.activeComputedColumns[colType] = that.activeComputedColumns[colType] || {};

        _.each(cols, function (colDesc, name) {
            that.activeComputedColumns[colType][name] = colDesc;
        });

    });

};

ComputedColumnManager.prototype.getActiveColumns = function () {
    return this.activeComputedColumns;
};

ComputedColumnManager.prototype.getColumnVersion = function (columnType, columnName) {
    return this.activeComputedColumns[columnType][columnName].version;
};

ComputedColumnManager.prototype.hasColumn = function (columnType, columnName) {
    if (this.activeComputedColumns[columnType] && this.activeComputedColumns[columnType][columnName]) {
        return true;
    }
    return false;
};


ComputedColumnManager.prototype.getValue = function (dataframe, columnType, columnName, idx) {

    var columnDesc = this.activeComputedColumns[columnType][columnName];
    // Check to see if we have have column registered
    if (!columnDesc) {
        // TODO should it throw?
        return undefined;
    }

    // Check if the computation can't be done on a single one (quickly)
    // E.g., requires an aggregate, so might as well compute all.
    if (!columnDesc.computeSingleValue) {
        var resultArray = this.getArray(dataframe, columnType, columnName);
        if (columnDesc.numberPerGraphComponent === 1) {
            return resultArray[idx];
        } else {
            var returnArr = new columnDesc.arrType(columnDesc.numberPerGraphComponent);
            for (var j = 0; j < columnDesc.numberPerGraphComponent; j++) {
                returnArr[j] = resultArray[idx*columnDesc.numberPerGraphComponent + j];
            }
            return returnArr;
        }
    }

    // Nothing precomputed -- recompute
    // TODO: Cache these one off computations?

    var dependencies = _.map(columnDesc.dependencies, function (dep) {
        var columnName = dep[0];
        var columnType = dep[1];
        // TODO: Impl
        return dataframe.getCell(idx, columnType, columnName);
    });

    dependencies.push(idx);
    dependencies.push(dataframe.getNumElements(columnDesc.graphComponentType));

    if (columnDesc.computeSingleValue) {
        return columnDesc.computeSingleValue.apply(this, dependencies);
    } else {
        throw new Error('No computed column creation function');
    }
};



ComputedColumnManager.prototype.getArray = function (dataframe, columnType, columnName, optionalArray) {

    var columnDesc = this.activeComputedColumns[columnType][columnName];

    // Check to see if we have have column registered
    if (!columnDesc) {
        // TODO should it throw?
        return undefined;
    }

    // Get dependencies
    var dependencies = _.map(columnDesc.dependencies, function (dep) {
        var columnName = dep[0];
        var columnType = dep[1];
        // TODO: Impl
        // TODO: Should this be an iterator instead of a raw array?
        return dataframe.getColumnValues(columnName, columnType);
    });

    var numGraphElements = dataframe.getNumElements(columnDesc.graphComponentType);
    var outputSize = columnDesc.numberPerGraphComponent * numGraphElements;
    var outputArr = new columnDesc.arrType(outputSize);

    // Check if an explicit function is provided to compute all
    if (columnDesc.computeAllValues) {
        dependencies.push(outputArr);
        dependencies.push(numGraphElements);
        return columnDesc.computeAllValues.apply(this, dependencies) || outputArr;

    } else if (columnDesc.computeSingleValue) {
        // Compute each individually using single function
        // dependencies.push(0);
        // dependencies.push(numGraphElements);

        var singleDependencies = _.map(dependencies, function () {
            return 0;
        });
        singleDependencies.push(0);
        singleDependencies.push(numGraphElements);


        for (var i = 0; i < numGraphElements; i++) {

            // set dependencies for this call
            _.each(dependencies, function (arr, idx) {
                singleDependencies[idx] = arr[i];
            });
            singleDependencies[singleDependencies.length - 2] = i;

            if (columnDesc.numberPerGraphComponent === 1) {
                outputArr[i] = columnDesc.computeSingleValue.apply(this, singleDependencies);
            } else {
                var res = columnDesc.computeSingleValue.apply(this, singleDependencies);
                for (var j = 0; j < columnDesc.numberPerGraphComponent; j++) {
                    outputArr[i*columnDesc.numberPerGraphComponent + j] = res[j];
                }
            }
        }
        return outputArr;

    } else {
        throw new Error('No computed column creation function');
    }

};















module.exports = ComputedColumnManager;

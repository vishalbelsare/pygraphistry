'use strict';

const _ = require('underscore');
const graphlib = require('graphlib');
const Graph = graphlib.Graph;

const util = require('./util.js');

//////////////////////////////////////////////////////////////////////////////
// DEFAULT ENCODINGS (TODO: Should these move into another file?)
//////////////////////////////////////////////////////////////////////////////

// Required fields in an encoding
//
// key: name of resulting local buffer
// ArrayVariant: constructor for typed array
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

// TODO: Replace aggregate dependencies that point to "raw" dataset with
// some sort of pointer to a base dataframe view

// Only aggregates can point to specific dataframe view (otherwise indexing doesn't make sense);
// TODO: Implement aggregates across computed columns too.

// TODO: Allow users to specify which view to pull dependencies from.

//////////////////////////////////////////////////////////////////////////////
// Constructor
//////////////////////////////////////////////////////////////////////////////

function ComputedColumnManager() {
    // We maintain a dependency graph between columns. dependency -> CC
    this.dependencyGraph = new Graph();
    /** @type Object.<GraphComponentTypes, Object.<String, ComputedColumnSpec>> */
    this.activeComputedColumns = {};

    // TODO FIXME HACK: Computed Column Manager should not understand logic of
    // knowing which specs to swap between, or even what defaults are.
    // Until we have a proper encodings manager, it will be a storing place for
    // that kind of basic information.
    this.overlayBufferSpecs = {};
}

//////////////////////////////////////////////////////////////////////////////
// Loading / Adding functions
//////////////////////////////////////////////////////////////////////////////

function keyFromColumn(columnType, columnName) {
    const key = '' + columnType + ':' + columnName;
    return key;
}

function typeAndNameFromKey(key) {
    const [columnType, columnName] = key.split(':');
    return {
        columnType,
        columnName
    };
}

ComputedColumnManager.prototype.bumpVersionsOnDependencies = function(columnType, columnName) {
    const columnKey = keyFromColumn(columnType, columnName);

    const keysToBump = [columnKey];
    // Walk through all dependencies of the provided column, to make sure they're also bumped
    const queue = [columnKey]; // push, shift
    while (queue.length > 0) {
        const workingKey = queue.shift();
        const outEdges = this.dependencyGraph.outEdges(workingKey);

        const newNodeKeys = _.pluck(outEdges, 'w');
        _.each(newNodeKeys, key => {
            keysToBump.push(key);
            queue.push(key);
        });
    }

    _.each(keysToBump, key => {
        const { columnType, columnName } = typeAndNameFromKey(key);
        const spec = this.getComputedColumnSpec(columnType, columnName);
        spec.bumpVersion();
    });
};

ComputedColumnManager.prototype.removeComputedColumnInternally = function(columnType, columnName) {
    const columnKey = keyFromColumn(columnType, columnName);

    // Check if there's something that depends on this column.
    // In the dependency graph, that's represented by an outgoing edge
    const outEdges = this.dependencyGraph.outEdges(columnKey);
    if (outEdges.length > 0) {
        throw new Error('Attempted to remove computed column that is required for another');
    }

    delete this.activeComputedColumns[columnType][columnName];

    // Remove node from graph.
    // TODO: Do we want to deal with dangling nodes in the graph at all,
    // or is it a non concern (since they won't be reachable)
    this.dependencyGraph.removeNode(columnKey);
};

// Remove edges in dependency graph for a given columns dependencies.
ComputedColumnManager.prototype.removeInwardColumnDependencyEdges = function(
    columnType,
    columnName
) {
    const columnKey = keyFromColumn(columnType, columnName);
    const inEdges = this.dependencyGraph.inEdges(columnKey);

    _.each(inEdges, edge => {
        this.dependencyGraph.removeEdge(edge.v, edge.w);
    });
};

ComputedColumnManager.prototype.loadComputedColumnSpecInternally = function(
    columnType,
    columnName,
    spec
) {
    // TODO: Validate that we don't form a cycle

    // Check to see if we're updating an existing one, or simply adding a new one.
    // This is mostly for internal dependency bookkeeping.
    const hasColumn = this.hasColumn(columnType, columnName);

    if (hasColumn) {
        this.removeInwardColumnDependencyEdges(columnType, columnName);
        // this.removeComputedColumnInternally(columnType, columnName);
    }

    const columnKey = keyFromColumn(columnType, columnName);
    const dependencyGraph = this.dependencyGraph;

    this.activeComputedColumns[columnType] = this.activeComputedColumns[columnType] || {};
    this.activeComputedColumns[columnType][columnName] = spec;

    // Add to graph
    dependencyGraph.setNode(columnKey);

    // Add dependencies to graph if they're not already there.
    // Add edge from dependency to this column
    _.each(spec.dependencies, dep => {
        const depKey = keyFromColumn(dep[1], dep[0]);

        if (!dependencyGraph.hasNode(depKey)) {
            dependencyGraph.setNode(depKey);
        }

        dependencyGraph.setEdge(depKey, columnKey);
    });

    // Assert that no dependency cycles were created
    if (!graphlib.alg.isAcyclic(dependencyGraph)) {
        throw new Error('Attempted to add a computed column that created a cycle');
    }

    // Walk through dependency tree and bump versions based on this change
    this.bumpVersionsOnDependencies(columnType, columnName);
};

// Public facing function, because it handles registering with the dataframe too.
ComputedColumnManager.prototype.addComputedColumn = function(
    dataframe,
    columnType,
    columnName,
    desc
) {
    this.loadComputedColumnSpecInternally(columnType, columnName, desc);
    dataframe.registerNewComputedColumn(this, columnType, columnName);
};

//////////////////////////////////////////////////////////////////////////////
// Lightweight Getters
//////////////////////////////////////////////////////////////////////////////

/**
 * @param {BufferTypeKeys} columnType
 * @param {String} columnName
 * @returns {ComputedColumnSpec}
 */
ComputedColumnManager.prototype.getComputedColumnSpec = function(columnType, columnName) {
    return (
        this.activeComputedColumns[columnType] && this.activeComputedColumns[columnType][columnName]
    );
};

ComputedColumnManager.prototype.getActiveColumns = function() {
    return this.activeComputedColumns;
};

ComputedColumnManager.prototype.getColumnVersion = function(columnType, columnName) {
    return this.activeComputedColumns[columnType][columnName].version;
};

ComputedColumnManager.prototype.hasColumn = function(columnType, columnName) {
    return this.getComputedColumnSpec(columnType, columnName) !== undefined;
};

//////////////////////////////////////////////////////////////////////////////
// Value Getters (where the magic happens)
//////////////////////////////////////////////////////////////////////////////

ComputedColumnManager.prototype.getValue = function(dataframe, columnType, columnName, idx) {
    const columnDesc = this.activeComputedColumns[columnType][columnName];
    // Check to see if we have have column registered
    if (!columnDesc || !columnDesc.isCompletelyDefined()) {
        throw new Error('Invalid column creation function for: ', columnType, columnName);
    }

    // Check if the computation can't be done on a single one (quickly)
    // E.g., requires an aggregate, so might as well compute all.
    if (!columnDesc.computeSingleValue) {
        const resultArray = this.getDenseMaterializedArray(dataframe, columnType, columnName);
        if (columnDesc.numberPerGraphComponent === 1) {
            return resultArray[idx];
        } else {
            const returnArr = new columnDesc.ArrayVariant(columnDesc.numberPerGraphComponent);
            for (let j = 0; j < columnDesc.numberPerGraphComponent; j++) {
                returnArr[j] = resultArray[idx * columnDesc.numberPerGraphComponent + j];
            }
            return returnArr;
        }
    }

    // Nothing precomputed -- recompute
    // TODO: Cache these one off computations?

    const dependencies = _.map(columnDesc.dependencies, ([dependencyName, dependencyType]) => {
        // TODO: Impl
        return dataframe.getCell(idx, dependencyType, dependencyName);
    });

    dependencies.push(idx);
    dependencies.push(dataframe.getNumElements(columnDesc.graphComponentType));

    if (columnDesc.computeSingleValue) {
        return columnDesc.computeSingleValue.apply(this, dependencies);
    } else {
        throw new Error('No computed column creation function');
    }
};

ComputedColumnManager.prototype.getDenseMaterializedArray = function(
    dataframe,
    columnType,
    columnName
) {
    const columnDesc = this.activeComputedColumns[columnType][columnName];

    // Check to see if we have have column registered
    if (!columnDesc || !columnDesc.isCompletelyDefined()) {
        throw new Error('Invalid column creation function for: ', columnType, columnName);
    }

    // Get dependencies
    const dependencies = _.map(columnDesc.dependencies, ([dependencyName, dependencyType]) => {
        // TODO: Impl
        // TODO: Should this be an iterator instead of a raw array?
        return dataframe.getColumnValues(dependencyName, dependencyType);
    });

    const numGraphElements = dataframe.getNumElements(columnDesc.graphComponentType);
    const outputSize = columnDesc.numberPerGraphComponent * numGraphElements;
    const outputArr = new columnDesc.ArrayVariant(outputSize);

    // Check if an explicit function is provided to compute all
    if (columnDesc.computeAllValues) {
        dependencies.push(outputArr);
        dependencies.push(numGraphElements);
        dependencies.push(dataframe.lastMasks);
        return columnDesc.computeAllValues.apply(this, dependencies) || outputArr;
    } else if (columnDesc.computeSingleValue) {
        // Compute each individually using single function
        // dependencies.push(0);
        // dependencies.push(numGraphElements);

        const singleDependencies = _.map(dependencies, () => 0);
        singleDependencies.push(0);
        singleDependencies.push(numGraphElements);
        singleDependencies.push(dataframe.lastMasks);

        for (let i = 0; i < numGraphElements; i++) {
            // set dependencies for this call
            _.each(dependencies, (arr, idx) => {
                if (columnDesc.numberPerGraphComponent === 1) {
                    singleDependencies[idx] = arr[i];
                } else {
                    const valueArray = new arr.constructor(columnDesc.numberPerGraphComponent);
                    for (let j = 0; j < columnDesc.numberPerGraphComponent; j++) {
                        valueArray[j] = arr[i * columnDesc.numberPerGraphComponent + j];
                    }
                    singleDependencies[idx] = valueArray;
                }
            });
            singleDependencies[singleDependencies.length - 2] = i;

            if (columnDesc.numberPerGraphComponent === 1) {
                outputArr[i] = columnDesc.computeSingleValue.apply(this, singleDependencies);
            } else {
                const res = columnDesc.computeSingleValue.apply(this, singleDependencies);
                for (let j = 0; j < columnDesc.numberPerGraphComponent; j++) {
                    outputArr[i * columnDesc.numberPerGraphComponent + j] = res[j];
                }
            }
        }
        return outputArr;
    } else {
        throw new Error('No computed column creation function');
    }
};

ComputedColumnManager.prototype.resetLocalBuffer = function(bufferName, dataframe) {
    if (!bufferName) {
        return false;
    }
    const originalDesc = this.overlayBufferSpecs[bufferName];
    // Guard against reset being called before an encoding is set
    if (originalDesc) {
        this.addComputedColumn(dataframe, 'localBuffer', bufferName, originalDesc);
        delete this.overlayBufferSpecs[bufferName];
        return true;
    }
    return false;
};

export default ComputedColumnManager;

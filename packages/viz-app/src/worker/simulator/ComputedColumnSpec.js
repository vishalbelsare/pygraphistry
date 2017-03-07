'use strict';

const _       = require('underscore');
const simpleflake = require('simpleflakes').simpleflake;

function getUniqueId () {
    const id = simpleflake();
    const stringId = id.toJSON();
    return stringId;
}

/**
 * @param {Object} optionalInitializationSpec
 * @constructor
 */
function ComputedColumnSpec (optionalInitializationSpec) {

    // Initialize with default values;
    this.version = getUniqueId();
    this.numberPerGraphComponent = 1;
    this.ArrayVariant = Array;
    this.dependencies = [];

    if (optionalInitializationSpec && optionalInitializationSpec.constructor === Object) {
        // TODO: Validate these inputs. Primarily meant for internal use
        _.each(_.keys(optionalInitializationSpec), (key) => {
            this[key] = optionalInitializationSpec[key];
        });
    }
}

const NecessaryProps = [
    'ArrayVariant', 'type', 'numberPerGraphComponent', 'graphComponentType',
    'dependencies'
];

const ComputationFunctionProps = [
    'computeAllValues', 'computeSingleValue'
];

ComputedColumnSpec.prototype.isCompletelyDefined = function () {
    const hasNecessaryProps = _.all(NecessaryProps, (name) => this[name] !== undefined);

    const hasAComputationFunction = _.any(ComputationFunctionProps, (name) => this[name] !== undefined);

    return hasNecessaryProps && hasAComputationFunction;
};


// Return a shallow clone of this object
// Delete computation functions + dependencies for safety
ComputedColumnSpec.prototype.clone = function () {
    const shallowClone = _.clone(this);
    const newSpec = new ComputedColumnSpec(shallowClone);

    delete newSpec.dependencies;
    delete newSpec.computeSingleValue;
    delete newSpec.computeAllValues;

    return newSpec;
};


// Setters. TODO: Will we ever do anything clever with these, or is this
// redundant since this is basically a plain object with helper functions?
ComputedColumnSpec.prototype.setComputeSingleValue = function (func) {
    this.computeSingleValue = func;
};

ComputedColumnSpec.prototype.setComputeAllValues = function (func) {
    this.computeAllValues = func;
};

ComputedColumnSpec.prototype.setDependencies = function (deps) {
    this.dependencies = deps;
};

ComputedColumnSpec.prototype.setGraphComponentType = function (graphComponentType) {
    this.graphComponentType = graphComponentType;
};

ComputedColumnSpec.prototype.setArrayVariant = function (arrType) {
    this.ArrayVariant = arrType;
};

ComputedColumnSpec.prototype.setDataType = function (dataType) {
    this.type = dataType;
};

ComputedColumnSpec.prototype.setNumberPerGraphComponent = function (numberPerGraphComponent) {
    this.numberPerGraphComponent = numberPerGraphComponent;
};

ComputedColumnSpec.prototype.setIndex = function (newIndex) {
    this.index = newIndex;
};

ComputedColumnSpec.prototype.setVersion = function (version) {
    this.version = version;
};

ComputedColumnSpec.prototype.bumpVersion = function () {
    this.version = getUniqueId();
};



export default ComputedColumnSpec;

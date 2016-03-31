'use strict';

var _       = require('underscore');
var flake = require('simpleflake');

function getUniqueId () {
    var id = flake();
    var stringId = id.toString('hex');
    return stringId;
}

function ComputedColumnSpec (optionalInitializationSpec) {

    // Initialize with default values;
    this.version = getUniqueId();
    this.numberPerGraphComponent = 1;
    this.arrType = Array;
    this.dependencies = [];

    if (optionalInitializationSpec && optionalInitializationSpec.constructor === Object) {
        this.initializeFromObject(optionalInitializationSpec);
    }

}

ComputedColumnSpec.prototype.isCompletelyDefined = function () {
    var that = this;

    var necessaryProps = [
        'arrType', 'type', 'numberPerGraphComponent', 'graphComponentType',
        'dependencies'
    ];
    var hasNecessaryProps = necessaryProps.map(function (name) {
        return that[name];
    }).filter(function (val) {
        return (val === undefined);
    }).length === 0;

    var computationFunctionProps = [
        'computeAllValues', 'computeSingleValue'
    ];
    var hasAComputationFunction = computationFunctionProps.map(function (name) {
        return that[name];
    }).filter(function (val) {
        return (val !== undefined);
    }).length >= 1;

    return hasNecessaryProps && hasAComputationFunction;
};

ComputedColumnSpec.prototype.initializeFromObject = function (obj) {
    // TODO: Validate these inputs. Primarily meant for internal use
    var that = this;

    _.each(_.keys(obj), function (key) {
        that[key] = obj[key];
    });
};

// Return a shallow clone of this object
// Delete computation functions + dependencies for safety
ComputedColumnSpec.prototype.clone = function () {
    var shallowClone = _.clone(this);
    var newSpec = new ComputedColumnSpec(shallowClone);

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

ComputedColumnSpec.prototype.setArrType = function (arrType) {
    this.arrType = arrType;
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



module.exports = ComputedColumnSpec;

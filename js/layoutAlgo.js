'use strict';

var     _ = require('underscore');
var debug = require('debug')('graphistry:graph-viz:cl:layoutalgo');


/* Abtract class for layout algorithms
 * GaussSeidel, ForceAtlas, etc. are subclasses of it */
var LayoutAlgo = function (name) {
    this.name = name
    this.kernels = [];
}

// Return the runtime statistics of each kernel
LayoutAlgo.prototype.runtimeStats = function() {
    return _.map(this.kernels, function (k) {
        return k.runtimeStats();
    });
}


// Methods to override when creating new layout algorithms.
LayoutAlgo.prototype.setPhysics = function (cfg) {
    debug('Default stub for setPhysics');
}
LayoutAlgo.prototype.setPoints = function (simulator) {
    debug('Default stub for setPoints');
}
LayoutAlgo.prototype.setEdges = function (simulator) {
    debug('Default stub for setEdges');
}
LayoutAlgo.prototype.tick = function (simulator, stepNumber) {
    debug('Default stub for tick');
}

module.exports = LayoutAlgo;

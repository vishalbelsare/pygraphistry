'use strict';

var     _ = require('underscore');
var Log         = require('common/logger.js');
var logger      = Log.createLogger('graph-viz:cl:layoutalgo');

/* Abtract class for layout algorithms
 * GaussSeidel, ForceAtlas, etc. are subclasses of it */
var LayoutAlgo = function (name) {
    this.name = name;
    this.kernels = [];
}

// Return the runtime statistics of each kernel
LayoutAlgo.prototype.runtimeStats = function(extraKernels) {
    return _.map(this.kernels.concat(extraKernels), function (k) {
        return k.runtimeStats();
    });
}


/*
 * Methods to override when creating new layout algorithms.
 */
LayoutAlgo.prototype.setPhysics = function (cfg) {
    logger.trace('Default implementation for setPhysics', cfg);
    // Set all kernel args matching with matching entry
    _.each(this.kernels, function (k) {
        k.set(_.pick(cfg, k.argNames))
    })
}
// are the arguments going to be used for anything?
LayoutAlgo.prototype.setPoints = function (simulator) {
    logger.debug('Default stub for setPoints');
}
LayoutAlgo.prototype.setEdges = function (simulator) {
    logger.debug('Default stub for setEdges');
}
LayoutAlgo.prototype.tick = function (simulator, stepNumber) {
    logger.debug('Default stub for tick');
}

module.exports = LayoutAlgo;

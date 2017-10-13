'use strict';

const _ = require('underscore');
const Q = require('q');
const log = require('@graphistry/common').logger;
const logger = log.createLogger('graph-viz', 'graph-viz/js/layoutAlgo.js');

/* Abstract class for layout algorithms
 * GaussSeidel, ForceAtlas, etc. are subclasses of it */
function LayoutAlgo(name) {
    this.name = name;
    this.kernels = [];
}

// Return the runtime statistics of each kernel
LayoutAlgo.prototype.runtimeStats = function(extraKernels) {
    return _.map(this.kernels.concat(extraKernels), function(k) {
        return k.runtimeStats();
    });
};

/*
 * Methods to override when creating new layout algorithms.
 */
LayoutAlgo.prototype.setPhysics = function(cfg) {
    logger.trace({ layoutConfig: cfg }, 'Default implementation for setPhysics', cfg);
    // Set all kernel args matching with matching entry
    _.each(this.kernels, function(k) {
        k.set(_.pick(cfg, k.argNames));
    });
};

// are the arguments going to be used for anything?
LayoutAlgo.prototype.setPoints = function(simulator) {
    logger.trace('Default stub for setPoints');
};
LayoutAlgo.prototype.setEdges = function(simulator) {
    logger.trace('Default stub for setEdges');
};
LayoutAlgo.prototype.tick = function(simulator, stepNumber) {
    logger.trace('Default stub for tick');
};
LayoutAlgo.prototype.updateDataframeBuffers = function(simulator) {
    console.log('Default stup for updateDataframeBuffers. Please implement.');
    return Q();
};

export default LayoutAlgo;

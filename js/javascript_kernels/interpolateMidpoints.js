'use strict';
var Kernel = require('../kernel.js'),
    Q = require('q'),
    _     = require('underscore'),
    cljs  = require('../cl.js');

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz:cl:interpolationKernel');

var interpolateMidpointsKernel = function (clContext) {

    var args = ['edges', 'points', 'numEdges', 'numSplits', 'outputMidPoints'],
        argsType = {
            edges: null,
            points: null,
            numEdges: cljs.types.uint_t,
            numSplits: cljs.types.uint_t,
            outputMidPoints: null,
        };

    this.interpolate = new Kernel('interpolateMidpoints', args, argsType,
            'interpolateMidpoints.cl', clContext);

    this.kernels = [this.interpolate];

    this.setPhysics = function (cfg, mask) {
        _.each(this.kernels, function (k) {
            k.set(_.pick(cfg, k.argNames));
        });
        this.faSwings.set({flags: mask});
    };

    this.execKernels = function (simulator) {

        var buffers = simulator.buffers,
            numSprings = simulator.numEdges,
            numSplits = simulator.numSplits,
            resources = [
                buffers.forwardsEdges,
            ];

        this.interpolate.set({
            edges: simulator.buffers.forwardsEdges.buffer,
            points: simulator.buffers.curPoints.buffer,
            numEdges: numSprings,
            numSplits: numSplits,
            outputMidPoints: simulator.buffers.curMidPoints.buffer
        });

        simulator.tickBuffers(['nextMidPoints']);

        logger.trace('Running interpolateMidpoints kernel');
        return this.interpolate.exec([simulator.numEdges], resources)
            .fail(log.makeQErrorHandler('Kernel interpolateMidPoints failed'));
    };
};

module.exports = interpolateMidpointsKernel;

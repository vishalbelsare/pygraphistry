'use strict'

var   debug = require('debug')('graphistry:graph-viz:cl:interpolateMidpoints'),
       cljs = require('./cl.js'),
       util = require('./util.js'),
        log = require('common/log.js'),
         eh = require('common/errorHandlers.js')(log),
          Q = require('q'),
     Kernel = require('./kernel.js');

function InterpolateMidpoints(clContext) {
    debug('Creating interpolateMidpoints kernel');

    var args = ['edges', 'inputPoints', 'numEdges', 'numSplits', 'midEdgePositions'];
    var argsType = {
        edges: null,
        points: null,
        numEdges: cljs.types.uint_t,
        numSplits: cljs.types.uint_t,
        outputMidPoints: null,
    };

    this.interpolate = new Kernel('interpolateMidpoints', args, argsType, 'interpolateMidpoints.cl', clContext);
}

SpringsGather.prototype.tick = function(simulator) {
    var buffers = simulator.buffers;
    var resources = [
        buffers.forwardsEdges,
        buffers.curPoints,
        buffers.springsPos
    ];

    var numSprings = simulator.numEdges;
    var numSplits = simulator.numSplits;
    this.interpolate.set({
        edges: simulator.buffers.forwardsEdges.buffer,
        points: simulator.buffers.curPoints.buffer,
        numEdges: numSprings,
        numSplits: numSplits,
        outputMidPoints: simulator.buffers.nextMidPoints.buffer
    });

    simulator.tickBuffers(['nextMidPoints']);

    debug('Running interpolateMidpoints kernel');
    return this.interpolate.exec([simulator.numEdges], resources)
        .fail(eh.makeErrorHandler('Kernel springGather failed'));
}

module.exports = SpringsGather;

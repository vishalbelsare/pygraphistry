'use strict'

var    cljs = require('./cl.js'),
       util = require('./util.js'),
          Q = require('q'),
     Kernel = require('./kernel.js');

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz:cl:springsgather');

function SpringsGather(clContext) {
    logger.trace('Creating springsGather kernel');

    var args = ['springs', 'inputPoints', 'numSprings', 'springPositions'];
    var argsType = {
        springs: null,
        inputPoints: null,
        numSprings: cljs.types.uint_t,
        springPositions: null
    };

    this.gather = new Kernel('springsGather', args, argsType, 'springsGather.cl', clContext);
}

SpringsGather.prototype.tick = function(simulator) {
    var buffers = simulator.buffers;
    var resources = [
        buffers.forwardsEdges,
        buffers.curPoints,
        buffers.springsPos
    ];

    var numSprings = simulator.numEdges;
    this.gather.set({
        springs: simulator.buffers.forwardsEdges.buffer,
        inputPoints: simulator.buffers.curPoints.buffer,
        numSprings: simulator.numEdges,
        springPositions: simulator.buffers.springsPos.buffer,
    });

    simulator.tickBuffers(['springsPos']);

    logger.trace('Running SpringsGather kernel');
    return this.gather.exec([simulator.numForwardsWorkItems], resources)
        .fail(log.makeQErrorHandler(logger, 'Kernel springGather failed'));
}

module.exports = SpringsGather;

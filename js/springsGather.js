'use strict'

var   debug = require('debug')('graphistry:graph-viz:cl:springsgather'),
       cljs = require('./cl.js'),
          Q = require('q'),
     Kernel = require('./kernel.js');

function SpringsGather(clContext) {
    debug('Creating springsGather kernel');

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

    debug('Running SpringsGather kernel');
    return this.gather.exec([simulator.numForwardsWorkItems], resources)
        .fail(function (err) {
            console.error('ERROR Kernel springGather failed ', (err||{}).stack);
        });
}

module.exports = SpringsGather;

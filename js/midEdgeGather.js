'use strict'

var   debug = require('debug')('graphistry:graph-viz:cl:springsgather'),
       cljs = require('./cl.js'),
       util = require('./util.js'),
          Q = require('q'),
     Kernel = require('./kernel.js');

function midEdgeGather(clContext) {
    debug('Creating springsGather kernel');

    var args = ['edges', 'midPoints', 'points', 'numEdges', 'numSplits', 'midEdgePositions'];
    var argsType = {
        springs: null,
        inputPoints: null,
        numSprings: cljs.types.uint_t,
        numSplits: cljs.types.uint_t,
        midEdgePositions: null
    };

    this.gather = new Kernel('midEdgeGather', args, argsType, 'midEdgeGather.cl', clContext);

    this.execKernels = function(simulator) {
      var buffers = simulator.buffers;
      var resources = [
        buffers.forwardsEdges,
        buffers.curMidpoints,
        buffers.curPoints,
        buffers.springsPos
      ];

      var numSprings = simulator.numEdges;
      this.gather.set({
        edges: simulator.buffers.forwardsEdges.buffer,
        midPoints: simulator.buffers.curMidPoints.buffer,
        points: simulator.buffers.curPoints.buffer,
        numEdges simulator.numEdges,
        numSplits: simulator.numSplits,
        midEdgePositions: simulator.buffers.springsPos.buffer,
      });

      simulator.tickBuffers(['springsPos']);

      debug('Running midEdgeGather kernel');
      return this.gather.exec([simulator.numForwardsWorkItems], resources)
        .fail(util.makeErrorHandler('Kernel midEdgeGather failed'));
    };


}

module.exports = MidEdgeGather;

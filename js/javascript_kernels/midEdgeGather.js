'use strict'

var   debug = require('debug')('graphistry:graph-viz:cl:midEdgegather'),
       cljs = require('../cl.js'),
       util = require('../util.js'),
          Q = require('q'),
     Kernel = require('../kernel.js');

function midEdgeGather(clContext) {
    debug('Creating springsGather kernel');

    var args = ['edges', 'midPoints', 'points', 'numEdges', 'numSplits', 'midEdgePositions'];
    var argsType = {
        edges: null,
        midPoints: null,
        points: null,
        numEdges: cljs.types.uint_t,
        numSplits: cljs.types.uint_t,
        midEdgePositions: null
    };

    this.gather = new Kernel('midEdgeGather', args, argsType, 'midEdgeGather.cl', clContext);

    this.execKernels = function(simulator) {
      var buffers = simulator.buffers;
    var resources = [
        simulator.buffers.forwardsEdges,
        simulator.buffers.forwardsWorkItems,
        simulator.buffers.curPoints,
        simulator.buffers.nextMidPoints,
        simulator.buffers.curMidPoints,
        simulator.buffers.midSpringsPos,
        simulator.buffers.midSpringsColorCoord
    ];


      var numSprings = simulator.numEdges;
      this.gather.set({
        edges: simulator.buffers.forwardsEdges.buffer,
        midPoints: simulator.buffers.nextMidPoints.buffer,
        points: simulator.buffers.curPoints.buffer,
        numEdges: simulator.numEdges,
        numSplits: simulator.numSplits,
        midEdgePositions: simulator.buffers.midSpringsPos.buffer
      });

      simulator.tickBuffers(['curMidPoints', 'midSpringsPos', 'midSpringsColorCoord']);

      debug('Running midEdgeGather kernel');
      return this.gather.exec([simulator.numForwardsWorkItems], resources)
        .fail(util.makeErrorHandler('Kernel midEdgeGather failed'));
    };


}

module.exports = midEdgeGather;

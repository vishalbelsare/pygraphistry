'use strict'

var   debug = require('debug')('graphistry:graph-viz:cl:midEdgegather'),
       cljs = require('../cl.js'),
        log = require('common/log.js'),
         eh = require('common/errorHandlers.js')(log),
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
        simulator.dataframe.getBuffer('forwardsEdges', 'simulator'),
        simulator.dataframe.getBuffer('forwardsWorkItems', 'simulator'),
        simulator.dataframe.getBuffer('curPoints', 'simulator'),
        simulator.dataframe.getBuffer('nextMidPoints', 'simulator'),
        simulator.dataframe.getBuffer('curMidPoints', 'simulator'),
        simulator.dataframe.getBuffer('midSpringsPos', 'simulator'),
        simulator.dataframe.getBuffer('midSpringsColorCoord', 'simulator')
      ];

      var numEdges = simulator.dataframe.getNumElements('edge');
      var numSplits = simulator.dataframe.getNumElements('splits');
      var numSprings = numEdges;
      this.gather.set({
        edges: simulator.dataframe.getBuffer('forwardsEdges', 'simulator').buffer,
        midPoints: simulator.dataframe.getBuffer('curMidPoints', 'simulator').buffer,
        points: simulator.dataframe.getBuffer('curPoints', 'simulator').buffer,
        numEdges: numEdges,
        numSplits: numSplits,
        midEdgePositions: simulator.dataframe.getBuffer('midSpringsPos', 'simulator').buffer
      });

      simulator.tickBuffers(['curMidPoints', 'midSpringsPos', 'midSpringsColorCoord']);

      debug('Running midEdgeGather kernel');
      return this.gather.exec([numEdges], resources)
        .fail(eh.makeErrorHandler('Kernel midEdgeGather failed'));
    };


}

module.exports = midEdgeGather;

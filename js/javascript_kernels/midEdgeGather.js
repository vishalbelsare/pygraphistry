'use strict'

var    cljs = require('../cl.js'),
          Q = require('q'),
     Kernel = require('../kernel.js');

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz:cl:midEdgeGather');

function midEdgeGather(clContext) {
    logger.trace('Creating springsGather kernel');

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

      simulator.tickBuffers(['midSpringsPos', 'midSpringsColorCoord']);

      logger.trace('Running midEdgeGather kernel');
      return this.gather.exec([numEdges], resources)
        .fail(log.makeQErrorHandler(logger, 'Kernel midEdgeGather failed'));
    };


}

module.exports = midEdgeGather;

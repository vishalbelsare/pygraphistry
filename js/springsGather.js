'use strict'

var   debug = require('debug')('graphistry:graph-viz:cl:springsgather'),
       cljs = require('./cl.js'),
       util = require('./util.js'),
        log = require('common/log.js'),
         eh = require('common/errorHandlers.js')(log),
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
    var numForwardsWorkItems = simulator.dataframe.getNumElements('forwardsWorkItems');
    var buffers = simulator.buffers;
    var resources = [
        simulator.dataframe.getBuffer('forwardsEdges', 'simulator'),
        simulator.dataframe.getBuffer('curPoints', 'simulator'),
        simulator.dataframe.getBuffer('springsPos', 'simulator')
    ];

    var numSprings = simulator.dataframe.getNumElements('edge');
    this.gather.set({

        springs: simulator.dataframe.getBuffer('forwardsEdges', 'simulator').buffer,
        inputPoints: simulator.dataframe.getBuffer('curPoints', 'simulator').buffer,
        numSprings: numSprings,
        springPositions: simulator.dataframe.getBuffer('springsPos', 'simulator').buffer
    });

    simulator.tickBuffers(['springsPos']);

    debug('Running SpringsGather kernel');
    return this.gather.exec([numForwardsWorkItems], resources)
        .fail(eh.makeErrorHandler('Kernel springGather failed'));
}

module.exports = SpringsGather;

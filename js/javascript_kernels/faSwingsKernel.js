'use strict';
var Kernel = require('../kernel.js'),
    Q = require('q'),
    _     = require('underscore'),
    cljs  = require('../cl.js'),
    ArgsType = require('./ArgsType.js');

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz:cl:barnesKernels');

var faSwingKernel = function (clContext) {


    this.argsSwings = ['prevForces', 'curForces', 'swings', 'tractions'];

    this.faSwings = new Kernel('faSwingsTractions', this.argsSwings,
                               ArgsType, 'forceAtlas2/faSwingsTractions.cl', clContext);


    this.kernels = [this.faSwings];

    this.setPhysics = function (cfg, mask) {
        _.each(this.kernels, function (k) {
            k.set(_.pick(cfg, k.argNames));
        });
        this.faSwings.set({flags: mask});
    };



    this.setEdges = function (simulator) {
    };

    this.setMidPoints = function(simulator, layoutBuffers) {
      var buffers = simulator.buffers;
      this.faSwings.set({
        prevForces: layoutBuffers.prevForces.buffer,
        curForces: layoutBuffers.curForces.buffer,
        swings: layoutBuffers.swings.buffer,
        tractions: layoutBuffers.tractions.buffer
      });
    };



    this.execKernels = function(simulator, workItems) {

        var buffers = simulator.buffers;
        this.faSwings.set({
            prevForces: simulator.dataframe.getBuffer('prevForces', 'simulator').buffer,
            curForces: simulator.dataframe.getBuffer('curForces', 'simulator').buffer,
            swings: simulator.dataframe.getBuffer('swings', 'simulator').buffer,
            tractions: simulator.dataframe.getBuffer('tractions', 'simulator').buffer
        });

        var resources = [
            simulator.dataframe.getBuffer('prevForces', 'simulator'),
            simulator.dataframe.getBuffer('curForces', 'simulator'),
            simulator.dataframe.getBuffer('swings', 'simulator'),
            simulator.dataframe.getBuffer('tractions', 'simulator')
        ];

        simulator.tickBuffers(['swings', 'tractions']);

        logger.trace("Running kernel faSwingsTractions");
        return this.faSwings.exec([simulator.dataframe.getNumElements('point')], resources)
            .fail(log.makeQErrorHandler(logger, 'Executing FaSwing failed'));
    };

    this.execMidPointsKernels = function(simulator, workItems) {

      //var resources = [
          //simulator.buffers.swings,
          //simulator.buffers.tractions
      //];
      var resources = [];

      //simulator.tickBuffers(['swings', 'tractions']);
      // var numMidpoints = simulator.numMidPoints;
      var numMidpoints = simulator.dataframe.getNumElements('midPoints');
      return this.faSwings.exec([numMidpoints], resources)
        .fail(log.makeQErrorHandler(logger, 'Executing FaSwing failed'));
    };

}

module.exports = faSwingKernel;

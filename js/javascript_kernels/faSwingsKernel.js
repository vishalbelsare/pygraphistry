'use strict';
var Kernel = require('../kernel.js'),
    Q = require('q'),
    _     = require('underscore'),
    cljs  = require('../cl.js'),
    ArgsType = require('./ArgsType.js');

var Log         = require('common/logger.js');
var logger      = Log.createLogger('graph-viz:cl:barnesKernels');

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
            prevForces: buffers.prevForces.buffer,
            curForces: buffers.curForces.buffer,
            swings: buffers.swings.buffer,
            tractions: buffers.tractions.buffer
        });

        var resources = [
            buffers.prevForces,
            buffers.curForces,
            buffers.swings,
                buffers.tractions
        ];

        simulator.tickBuffers(['swings', 'tractions']);

        logger.debug("Running kernel faSwingsTractions");
        return this.faSwings.exec([simulator.numPoints], resources)
        .fail(Log.makeQErrorHandler('Executing FaSwing failed'));
    };

    this.execMidPointsKernels = function(simulator, workItems) {

      //var resources = [
          //simulator.buffers.swings,
          //simulator.buffers.tractions
      //];
      var resources = [];

      //simulator.tickBuffers(['swings', 'tractions']);

        return this.faSwings.exec([simulator.numMidPoints], resources)
        .fail(Log.makeQErrorHandler('Executing FaSwing failed'));
    };

}

module.exports = faSwingKernel;

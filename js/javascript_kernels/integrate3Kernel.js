var Kernel = require('../kernel.js'),
    Q = require('q'),
    debug = require("debug")("graphistry:graph-viz:cl:barensKernels"),
    _     = require('underscore'),
    cljs  = require('../cl.js');
    util = require('../util.js'),
    ArgsType = require('./ArgsType.js');

var integrate3Kernel = function (clContext) {


  this.argsIntegrate3 = [
    'globalSpeed', 'inputPositions', 'curForces', 'swings', 'outputPositions'
  ];

  this.faIntegrate3 = new Kernel('faIntegrate3', this.argsIntegrate3,
      ArgsType, 'forceAtlas2.cl', clContext);


  this.kernels = [this.faIntegrate3];

  this.setPhysics = function(cfg, mask) {
    _.each(this.kernels, function (k) {
      k.set(_.pick(cfg, k.argNames))
    })
    this.faSwings.set({flags: mask});
  };


  this.execKernels = function(simulator, tempLayoutBuffers) {
    var buffers = simulator.buffers;

    this.faIntegrate3.set({
        globalSpeed: tempLayoutBuffers.globalSpeed.buffer,
        inputPositions: buffers.curPoints.buffer,
        curForces: buffers.curForces.buffer,
        swings: buffers.swings.buffer,
        outputPositions: buffers.nextPoints.buffer
    });

    var resources = [
        buffers.curPoints,
        buffers.curForces,
        buffers.swings,
        buffers.nextPoints
    ];

    simulator.tickBuffers(['nextPoints']);

    debug("Running kernel faIntegrate");
    return this.faIntegrate3.exec([simulator.numPoints], resources)
        .fail(util.makeErrorHandler('Executing Integrate3 failed'));
}

}

module.exports = integrate3Kernel;

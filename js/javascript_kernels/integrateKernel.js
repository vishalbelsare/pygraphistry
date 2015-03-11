var Kernel = require('../kernel.js'),
    Q = require('q'),
    debug = require("debug")("graphistry:graph-viz:cl:barensKernels"),
    _     = require('underscore'),
    cljs  = require('../cl.js');
    util = require('../util.js'),
    ArgsType = require('./ArgsType.js');

var integrateKernel = function (clContext) {


  this.argsIntegrate = [
    'globalSpeed', 'inputPositions', 'curForces', 'swings', 'outputPositions'
  ];

  this.faIntegrate = new Kernel('faIntegrate', this.argsIntegrate,
      ArgsType, 'forceAtlas2/faIntegrate.cl', clContext);


  this.kernels = [this.faIntegrate];

  this.setPhysics = function(cfg, mask) {
    _.each(this.kernels, function (k) {
      k.set(_.pick(cfg, k.argNames))
    })
    this.faSwings.set({flags: mask});
  };


  this.execKernels = function(simulator, tempLayoutBuffers) {
    var buffers = simulator.buffers;

    this.faIntegrate.set({
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
    return this.faIntegrate.exec([simulator.numPoints], resources)
        .fail(util.makeErrorHandler('Executing Integrate failed'));
}

}

module.exports = integrateKernel;

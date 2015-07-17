var Kernel = require('../kernel.js'),
    Q = require('q'),
    _     = require('underscore'),
    cljs  = require('../cl.js'),
    ArgsType = require('./ArgsType.js');

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz:cl:barnesKernels');

var integrateKernel = function (clContext) {


  this.argsIntegrate = [
    'globalSpeed', 'inputPositions', 'curForces', 'swings', 'outputPositions'
  ];

  this.faIntegrate = new Kernel('faIntegrate', this.argsIntegrate,
      ArgsType, 'forceAtlas2/faIntegrateMidPoints.cl', clContext);


  this.kernels = [this.faIntegrate];

  this.setPhysics = function(cfg, mask) {
    _.each(this.kernels, function (k) {
      k.set(_.pick(cfg, k.argNames))
    })
    //this.faSwings.set({flags: mask});
  };


  this.execKernels = function(simulator, tempLayoutBuffers) {
    var buffers = simulator.buffers;

    this.faIntegrate.set({
        globalSpeed: tempLayoutBuffers.globalSpeed.buffer,
        inputPositions: buffers.curMidPoints.buffer,
        curForces: tempLayoutBuffers.curForces.buffer,
        swings: tempLayoutBuffers.swings.buffer,
        outputPositions: buffers.nextMidPoints.buffer
    });

    var resources = [
        buffers.curPoints,
        buffers.curForces,
        buffers.swings,
        buffers.nextPoints
    ];

    simulator.tickBuffers(['nextPoints']);

    logger.trace("Running kernel faIntegrate");
    return this.faIntegrate.exec([simulator.numMidPoints], resources)
        .fail(log.makeQErrorHandler('Executing Integrate failed'));
  }

}

module.exports = integrateKernel;

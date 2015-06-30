var Kernel = require('../kernel.js'),
    Q = require('q'),
    _     = require('underscore'),
    cljs  = require('../cl.js'),
    ArgsType = require('./ArgsType.js');

var Log         = require('common/logger.js');
var logger      = Log.createLogger('graph-viz:cl:integrationKernel');

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

    logger.trace("Running kernel faIntegrate");
    return this.faIntegrate.exec([simulator.numPoints], resources)
        .fail(Log.makeQErrorHandler('Executing Integrate failed'));
}

}

module.exports = integrateKernel;

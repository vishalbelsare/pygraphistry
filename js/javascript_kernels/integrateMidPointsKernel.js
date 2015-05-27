var Kernel = require('../kernel.js'),
    Q = require('q'),
    debug = require("debug")("graphistry:graph-viz:cl:barensKernels"),
    _     = require('underscore'),
    cljs  = require('../cl.js'),
      log = require('common/log.js'),
       eh = require('common/errorHandlers.js')(log),
    ArgsType = require('./ArgsType.js');

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

    debug("Running kernel faIntegrate");
    return this.faIntegrate.exec([simulator.numMidPoints], resources)
        .fail(eh.makeErrorHandler('Executing Integrate failed'));
  }

}

module.exports = integrateKernel;

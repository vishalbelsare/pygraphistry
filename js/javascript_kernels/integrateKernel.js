var Kernel = require('../kernel.js'),
    Q = require('q'),
    debug = require("debug")("graphistry:graph-viz:cl:integrationKernel"),
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
    var numPoints = simulator.dataframe.getNumElements('point');

    this.faIntegrate.set({
        globalSpeed: tempLayoutBuffers.globalSpeed.buffer,
        inputPositions: simulator.dataframe.getBuffer('curPoints', 'simulator').buffer,
        curForces: simulator.dataframe.getBuffer('curForces', 'simulator').buffer,
        swings: simulator.dataframe.getBuffer('swings', 'simulator').buffer,
        outputPositions: simulator.dataframe.getBuffer('nextPoints', 'simulator').buffer
    });

    var resources = [
        simulator.dataframe.getBuffer('curPoints', 'simulator'),
        simulator.dataframe.getBuffer('curForces', 'simulator'),
        simulator.dataframe.getBuffer('swings', 'simulator'),
        simulator.dataframe.getBuffer('nextPoints', 'simulator')
    ];

    simulator.tickBuffers(['nextPoints']);

    debug("Running kernel faIntegrate");
    return this.faIntegrate.exec([numPoints], resources)
        .fail(eh.makeErrorHandler('Executing Integrate failed'));
}

}

module.exports = integrateKernel;

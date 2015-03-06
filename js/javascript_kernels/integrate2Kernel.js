var Kernel = require('../kernel.js'),
    Q = require('q'),
    debug = require("debug")("graphistry:graph-viz:cl:barensKernels"),
    _     = require('underscore'),
    cljs  = require('../cl.js');
    util = require('../util.js'),
    ArgsType = require('./ArgsType.js');

var integrate2Kernel = function (clContext) {


this.argsIntegrate2 = [
    'numPoints', 'tau', 'inputPositions', 'pointDegrees', 'curForces', 'swings',
    'tractions', 'outputPositions'
];

    this.faIntegrate2 = new Kernel('faIntegrate2', this.argsIntegrate2,
                               ArgsType, 'forceAtlas2.cl', clContext);


    this.kernels = [this.faIntegrate2];

    this.setPhysics = function(cfg, mask) {
        _.each(this.kernels, function (k) {
            k.set(_.pick(cfg, k.argNames))
        })
        this.faSwings.set({flags: mask});
    };




    this.execKernels = function(simulator) {
      var buffers = simulator.buffers;

      this.faIntegrate2.set({
        numPoints: simulator.numPoints,
        inputPositions: buffers.curPoints.buffer,
        pointDegrees: buffers.degrees.buffer,
        curForces: buffers.curForces.buffer,
        swings: buffers.swings.buffer,
        tractions: buffers.tractions.buffer,
        outputPositions: buffers.nextPoints.buffer
      });

      var resources = [
        buffers.curPoints,
        buffers.forwardsDegrees,
        buffers.backwardsDegrees,
          buffers.curForces,
          buffers.swings,
            buffers.tractions,
            buffers.nextPoints
      ];

      simulator.tickBuffers(['nextPoints']);

    debug('Running kernel faIntegrate2');
    return this.faIntegrate2.exec([simulator.numPoints], resources)
      .fail(util.makeErrorHandler('Executing Integrate2 failed'));
    }

}

module.exports = integrate2Kernel;

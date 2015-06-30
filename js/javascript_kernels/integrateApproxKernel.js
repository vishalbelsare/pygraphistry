var Kernel = require('../kernel.js'),
    Q = require('q'),
    _     = require('underscore'),
    cljs  = require('../cl.js'),
    ArgsType = require('./ArgsType.js');

var Log         = require('common/logger.js');
var logger      = Log.createLogger('graph-viz:cl:barnesKernels');

var integrateApproxKernel = function (clContext) {


this.argsIntegrateApprox = [
    'numPoints', 'tau', 'inputPositions', 'pointDegrees', 'curForces', 'swings',
    'tractions', 'outputPositions'
];

    this.faIntegrateApprox = new Kernel('faIntegrateApprox', this.argsIntegrateApprox,
                               ArgsType, 'forceAtlas2/faIntegrateApprox.cl', clContext);


    this.kernels = [this.faIntegrateApprox];

    this.setPhysics = function(cfg, mask) {
        _.each(this.kernels, function (k) {
            k.set(_.pick(cfg, k.argNames))
        })
        this.faSwings.set({flags: mask});
    };




    this.execKernels = function(simulator) {
      var buffers = simulator.buffers;

      this.faIntegrateApprox.set({
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

    logger.trace('Running kernel faIntegrateApprox');
    return this.faIntegrateApprox.exec([simulator.numPoints], resources)
      .fail(Log.makeQErrorHandler('Executing IntegrateApprox failed'));
    }

}

module.exports = integrateApproxKernel;

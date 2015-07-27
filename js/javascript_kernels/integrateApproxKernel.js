var Kernel = require('../kernel.js'),
    Q = require('q'),
    _     = require('underscore'),
    cljs  = require('../cl.js'),
    ArgsType = require('./ArgsType.js');

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz:cl:barnesKernels');

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

      var numPoints = simulator.dataframe.getNumElements('point');

      this.faIntegrateApprox.set({
        numPoints: numPoints,
        inputPositions: simulator.dataframe.getBuffer('curPoints', 'simulator').buffer,
        pointDegrees: simulator.dataframe.getBuffer('degrees', 'simulator').buffer,
        curForces: simulator.dataframe.getBuffer('curForces', 'simulator').buffer,
        swings: simulator.dataframe.getBuffer('swings', 'simulator').buffer,
        tractions: simulator.dataframe.getBuffer('tractions', 'simulator').buffer,
        outputPositions: simulator.dataframe.getBuffer('nextPoints', 'simulator').buffer
      });

      var resources = [
        simulator.dataframe.getBuffer('curPoints', 'simulator'),
        simulator.dataframe.getBuffer('degrees', 'simulator'),
        simulator.dataframe.getBuffer('curForces', 'simulator'),
        simulator.dataframe.getBuffer('swings', 'simulator'),
        simulator.dataframe.getBuffer('tractions', 'simulator'),
        simulator.dataframe.getBuffer('nextPoints', 'simulator')
      ];

      simulator.tickBuffers(['nextPoints']);

      logger.trace('Running kernel faIntegrateApprox');
      return this.faIntegrateApprox.exec([numPoints], resources)
        .fail(log.makeQErrorHandler(logger, 'Executing IntegrateApprox failed'));
    }

}

module.exports = integrateApproxKernel;

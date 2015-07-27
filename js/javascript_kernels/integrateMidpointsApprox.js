var Kernel = require('../kernel.js'),
    Q = require('q'),
    _     = require('underscore'),
    cljs  = require('../cl.js');
    ArgsType = require('./ArgsType.js');

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz:cl:barnesKernels');

var integrateMidPointsApproxKernel = function (clContext) {


this.argsIntegrateMidPointsApprox = [
    'numMidPoints', 'tau', 'inputPositions', 'curForces', 'swings',
    'tractions', 'outputPositions'
];

    this.faIntegrate = new Kernel('faIntegrateMidPointsApprox', this.argsIntegrateMidPointsApprox,
                               ArgsType, 'forceAtlas2/faIntegrateMidPointsApprox.cl', clContext);


    this.kernels = [this.faIntegrate];

    this.setPhysics = function(cfg, mask) {
        _.each(this.kernels, function (k) {
            k.set(_.pick(cfg, k.argNames))
        })
        //this.faIntegrate.set({flags: mask});
    };




    this.execKernels = function(simulator) {
      var buffers = simulator.buffers;
      var numMidPoints = simulator.dataframe.getNumElements('midPoints');

      this.faIntegrate.set({
        numMidPoints: numMidPoints,
        inputPositions: simulator.dataframe.getBuffer('curMidPoints', 'simulator').buffer,
        curForces: simulator.dataframe.getBuffer('curForces', 'simulator').buffer,
        swings: simulator.dataframe.getBuffer('swings', 'simulator').buffer,
        tractions: simulator.dataframe.getBuffer('tractions', 'simulator').buffer,
        outputPositions: simulator.dataframe.getBuffer('nextMidPoints', 'simulator').buffer
      });

      var resources = [
        simulator.dataframe.getBuffer('curMidPoints', 'simulator'),
        simulator.dataframe.getBuffer('curForces', 'simulator'),
        simulator.dataframe.getBuffer('swings', 'simulator'),
        simulator.dataframe.getBuffer('tractions', 'simulator'),
        simulator.dataframe.getBuffer('nextMidPoints', 'simulator')
      ];

      simulator.tickBuffers(['nextPoints']);

    logger.trace('Running kernel faIntegrateApprox');
    return this.faIntegrate.exec([numMidPoints], resources)
      .fail(log.makeQErrorHandler(logger, 'Executing IntegrateApprox failed'));
    }

}

module.exports = integrateMidPointsApproxKernel;

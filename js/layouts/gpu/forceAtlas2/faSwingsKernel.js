'use strict';
var Kernel = require('../../../kernel.js'),
    Q = require('q'),
    _     = require('underscore'),
    ArgsType = require('../../ArgsType.js');

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz:cl:barnesKernels');

var faSwingKernel = function (clContext) {

    var args = {
        prevForces : null,
        curForces : null,
        swings : null,
        tractions : null
    }

    this.faSwings = new Kernel('faSwingsTractions', Object.keys(args), args,
                               'layouts/gpu/forceAtlas2/faSwingsTractions.cl', clContext);

    this.kernels = [this.faSwings];

    this.execKernels = function(simulator, workItems) {

        var buffers = simulator.buffers;
        this.faSwings.set({
            prevForces: simulator.dataframe.getBuffer('prevForces', 'simulator').buffer,
            curForces: simulator.dataframe.getBuffer('curForces', 'simulator').buffer,
            swings: simulator.dataframe.getBuffer('swings', 'simulator').buffer,
            tractions: simulator.dataframe.getBuffer('tractions', 'simulator').buffer
        });

        var resources = [
            simulator.dataframe.getBuffer('prevForces', 'simulator'),
            simulator.dataframe.getBuffer('curForces', 'simulator'),
            simulator.dataframe.getBuffer('swings', 'simulator'),
            simulator.dataframe.getBuffer('tractions', 'simulator')
        ];

        simulator.tickBuffers(['swings', 'tractions']);

        logger.trace("Running kernel faSwingsTractions");
        return this.faSwings.exec([simulator.dataframe.getNumElements('point')], resources)
            .fail(log.makeQErrorHandler(logger, 'Executing FaSwing failed'));
    };
}

module.exports = faSwingKernel;

var Kernel = require('../kernel.js'),
    Q = require('q'),
    debug = require("debug")("graphistry:graph-viz:cl:barensKernels"),
    _     = require('underscore'),
    cljs  = require('../cl.js');
    ArgsType = require('./ArgsType.js');

var faSwingKernel = function (clContext) {


    this.argsSwings = ['prevForces', 'curForces', 'swings' , 'tractions'];

    this.faSwings = new Kernel('faSwingsTractions', this.argsSwings,
                               ArgsType, 'forceAtlas2/faSwingsTractions.cl', clContext);


    this.kernels = [this.faSwings];

    this.setPhysics = function(cfg, mask) {
        _.each(this.kernels, function (k) {
            k.set(_.pick(cfg, k.argNames))
        })
        this.faSwings.set({flags: mask});
    };



    this.setEdges = function(simulator, layoutBuffers) {
    };

    this.execKernels = function(simulator) {

        var buffers = simulator.buffers;
        this.faSwings.set({
            prevForces: buffers.prevForces.buffer,
            curForces: buffers.curForces.buffer,
            swings: buffers.swings.buffer,
            tractions: buffers.tractions.buffer
        });

        var resources = [
            buffers.prevForces,
            buffers.curForces,
            buffers.swings,
                buffers.tractions
        ];

        simulator.tickBuffers(['swings', 'tractions']);

        debug("Running kernel faSwingsTractions");
        return this.faSwings.exec([simulator.numPoints], resources)
        .fail(util.makeErrorHandler('Executing FaSwing failed'));
    };

}

module.exports = faSwingKernel;

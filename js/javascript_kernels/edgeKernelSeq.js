var Kernel = require('../kernel.js'),
    Q = require('q'),
    debug = require("debug")("graphistry:graph-viz:cl:barensKernels"),
    _     = require('underscore'),
    cljs  = require('../cl.js');
    ArgsType = require('./ArgsType.js');

var edgeKernelSeq = function (clContext) {

    this.argsEdges = [
        'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'edges',
        'workList', 'inputPoints', 'partialForces', 'stepNumber', 'numWorkItems', 'outputForces'
    ];


    this.faEdges = new Kernel('faEdgeForces', this.argsEdges,
                               ArgsType, 'forceAtlas2.cl', clContext);


    this.kernels = [this.faEdges];

    this.setPhysics = function(cfg, mask) {
        _.each(this.kernels, function (k) {
            k.set(_.pick(cfg, k.argNames))
        })
        this.faEdges.set({flags: mask});
    };



    this.setEdges = function(simulator, layoutBuffers) {
    };

    this.execKernels = function(simulator, edges, workItems, numWorkItems, points,
                                stepNumber, partialForces, outputForces ) {

        this.faEdges.set({
            edges: edges.buffer,
            workList: workItems.buffer,
            inputPoints: points.buffer,
            stepNumber: stepNumber,
            numWorkItems: numWorkItems,
            partialForces: partialForces.buffer,
            outputForces: outputForces.buffer
        });

        var resources = [edges, workItems, points, partialForces, outputForces];

        simulator.tickBuffers(
                _.keys(simulator.buffers).filter(function (name) {
                    return simulator.buffers[name] == outputForces;
                })
                );

        debug("Running kernel faEdgeForces");
        return this.faEdges.exec([256*256], resources, [256]);
        .fail(util.makeErrorHandler("Executing edgeKernelSeq failed"));
    };

}

module.exports = edgeKernelSeq;

var Kernel = require('../kernel.js'),
         Q = require('q'),
         _ = require('underscore'),
      cljs = require('../cl.js'),
  ArgsType = require('./ArgsType.js');

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz:cl:barnesKernels');

var edgeKernelSeq = function (clContext) {

    this.argsEdges = [
        'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'edges',
        'workList', 'inputPoints', 'partialForces', 'stepNumber', 'numWorkItems', 'outputForces'
    ];


    this.faEdges = new Kernel('faEdgeForces', this.argsEdges,
                               ArgsType, 'forceAtlas2/faEdgeForces.cl', clContext);


    this.kernels = [this.faEdges];

    this.setPhysics = function(flag) {
        this.faEdges.set({flags: flag});
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

        logger.trace("Running kernel faEdgeForces");
        return this.faEdges.exec([256*256], resources, [256])
        .fail(log.makeQErrorHandler("Executing edgeKernelSeq failed"));
    };

}

module.exports = edgeKernelSeq;

var Kernel = require('../kernel.js'),
    Q = require('q'),
    debug = require("debug")("graphistry:graph-viz:cl:barensKernels"),
    _     = require('underscore'),
    cljs  = require('../cl.js');

var edgeKernelSeq = function (clContext) {

    this.argsEdges = [
        'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'edges',
        'workList', 'inputPoints', 'partialForces', 'stepNumber', 'numWorkItems', 'outputForces'
    ];

    this.argsType = {
        scalingRatio: cljs.types.float_t,
        gravity: cljs.types.float_t,
        edgeInfluence: cljs.types.uint_t,
        flags: cljs.types.uint_t,
        numPoints: cljs.types.uint_t,
        tilesPerIteration: cljs.types.uint_t,
        tilePointsParam: cljs.types.local_t,
        tilePointsParam2: cljs.types.local_t,
        inputPositions: null,
        pointForces: null,
        partialForces: null,
        outputForces: null,
        outputPositions: null,
        width: cljs.types.float_t,
        height: cljs.types.float_t,
        stepNumber: cljs.types.uint_t,
        pointDegrees: null,
        edges: null,
        workList: null,
        inputPoints: null,
        outputPoints: null,
        curForces: null,
        prevForces: null,
        swings: null,
        tractions: null,
        gSpeeds: null,
        tau: cljs.types.float_t,
        gSpeed: cljs.types.float_t,
        springs: null,
        xCoords: null,
        yCoords: null,
        accX: null,
        accY: null,
        children: null,
        mass: null,
        start: null,
        sort: null,
        globalXMin: null,
        globalXMax: null,
        globalYMin: null,
        globalYMax: null,
        count: null,
        blocked: null,
        step: null,
        bottom: null,
        maxDepth: null,
        radius: null,
        numBodies: cljs.types.uint_t,
        numNodes: cljs.types.uint_t,
        numWorkItems: cljs.types.uint_t,
        globalSpeed: null
    }

    this.faEdges = new Kernel('faEdgeForces', this.argsEdges,
                               this.argsType, 'forceAtlas2.cl', clContext);


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
    };

}

module.exports = edgeKernelSeq;

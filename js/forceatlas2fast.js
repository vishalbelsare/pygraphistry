'use strict';

var   debug = require("debug")("graphistry:graph-viz:cl:forceatlas2"),
          _ = require('underscore'),
       cljs = require('./cl.js'),
GaussSeidel = require('./gaussseidel.js'),
          Q = require('q'),
       util = require('./util.js'),
      webcl = require('node-webcl'),
 LayoutAlgo = require('./layoutAlgo.js'),
     Kernel = require('./kernel.js');


function ForceAtlas2(clContext) {
    LayoutAlgo.call(this, 'ForceAtlas2Fast');

    debug('Creating ForceAtlas2 kernels');
    this.faPoints = new Kernel('faPointForces', ForceAtlas2.argsPoints,
                               ForceAtlas2.argsType, 'forceAtlas2Fast.cl', clContext);
    this.faEdges = new Kernel('faEdgeForces', ForceAtlas2.argsEdges,
                               ForceAtlas2.argsType, 'forceAtlas2Fast.cl', clContext);

    this.faSwings = new Kernel('faSwingsTractions', ForceAtlas2.argsSwings,
                               ForceAtlas2.argsType, 'forceAtlas2Fast.cl', clContext);

    this.faIntegrate = new Kernel('faIntegrate', ForceAtlas2.argsIntegrate,
                               ForceAtlas2.argsType, 'forceAtlas2Fast.cl', clContext);

    this.faIntegrate2 = new Kernel('faIntegrate2', ForceAtlas2.argsIntegrate2,
                               ForceAtlas2.argsType, 'forceAtlas2Fast.cl', clContext);

    this.gsGather = new Kernel('gaussSeidelSpringsGather', GaussSeidel.argsGather,
                               GaussSeidel.argsType, 'gaussSeidel.cl', clContext);

    this.kernels = this.kernels.concat([this.faPoints, this.faEdges, this.faSwings,
                                       this.faIntegrate, this.faIntegrate2, this.gsGather]);
}
ForceAtlas2.prototype = Object.create(LayoutAlgo.prototype);
ForceAtlas2.prototype.constructor = ForceAtlas2;

ForceAtlas2.argsPoints = [
    'preventOverlap', 'strongGravity', 'scalingRatio', 'gravity',
    'edgeInfluence', 'tilePointsParam',
    'tilePointsParam2', 'numPoints', 'tilesPerIteration', 'inputPositions',
    'width', 'height', 'stepNumber', 'pointDegrees', 'pointForces'
];

ForceAtlas2.argsEdges = [
    'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'edges',
    'workList', 'inputPoints', 'partialForces', 'stepNumber', 'outputForces'
];

ForceAtlas2.argsSwings = ['prevForces', 'curForces', 'swings' , 'tractions'];

ForceAtlas2.argsIntegrate = [
    'gSpeed', 'inputPositions', 'curForces', 'swings', 'outputPositions'
];

ForceAtlas2.argsIntegrate2 = [
    'numPoints', 'tau', 'inputPositions', 'pointDegrees', 'curForces', 'swings',
    'tractions', 'outputPositions'
];

ForceAtlas2.argsType = {
    scalingRatio: cljs.types.float_t,
    gravity: cljs.types.float_t,
    edgeInfluence: cljs.types.uint_t,
    flags: cljs.types.uint_t,
    preventOverlap: cljs.types.define,
    strongGravity: cljs.types.define,
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
    tau: cljs.types.float_t,
    gSpeed: cljs.types.float_t
}


ForceAtlas2.prototype.setPhysics = function(cfg) {
    LayoutAlgo.prototype.setPhysics.call(this, cfg)

    var mask = 0;
    var flags = ['dissuadeHubs', 'linLog'];
    flags.forEach(function (flag, i) {
        var isOn = cfg.hasOwnProperty(flag) ? cfg[flag] : false;
        if (isOn) {
            mask = mask | (1 << i);
        }
    });
    this.faEdges.set({flags: mask});
}


ForceAtlas2.prototype.setEdges = function(simulator) {
        var localPosSize =
            Math.min(simulator.cl.maxThreads, simulator.numMidPoints)
            * simulator.elementsPerPoint
            * Float32Array.BYTES_PER_ELEMENT;

        this.faPoints.set({
            tilePointsParam: 1,
            tilePointsParam2: 1,
            tilesPerIteration: simulator.tilesPerIteration,
            numPoints: simulator.numPoints,
            inputPositions: simulator.buffers.curPoints.buffer,
            width: simulator.dimensions[0],
            height: simulator.dimensions[1],
            pointDegrees: simulator.buffers.degrees.buffer,
            pointForces: simulator.buffers.partialForces1.buffer
        });

        this.gsGather.set({
            springs: simulator.buffers.forwardsEdges.buffer,
            inputPoints: simulator.buffers.curPoints.buffer,
            springPositions: simulator.buffers.springsPos.buffer
        });
}


function pointForces(simulator, faPoints, stepNumber) {
    var resources = [
        simulator.buffers.curPoints,
        simulator.buffers.forwardsDegrees,
        simulator.buffers.backwardsDegrees,
        simulator.buffers.partialForces1
    ];

    faPoints.set({stepNumber: stepNumber});

    simulator.tickBuffers(['partialForces1']);

    debug("Running kernel faPointForces");
    return faPoints.exec([simulator.numPoints], resources)
        .fail(function (err) {
            console.error('Kernel faPointForces failed', err, (err||{}).stack);
        });
}


function edgeForcesOneWay(simulator, faEdges, edges, workItems, numWorkItems,
                          points, stepNumber, partialForces, outputForces) {
    faEdges.set({
        edges: edges.buffer,
        workList: workItems.buffer,
        inputPoints: points.buffer,
        stepNumber: stepNumber,
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
    return faEdges.exec([numWorkItems], resources);
}


function edgeForces(simulator, faEdges, stepNumber) {
    var buffers = simulator.buffers;
    return edgeForcesOneWay(simulator, faEdges,
                            buffers.forwardsEdges, buffers.forwardsWorkItems,
                            simulator.numForwardsWorkItems,
                            buffers.curPoints, stepNumber,
                            buffers.partialForces1, buffers.partialForces2)
    .then(function () {
        return edgeForcesOneWay(simulator, faEdges,
                                buffers.backwardsEdges, buffers.backwardsWorkItems,
                                simulator.numBackwardsWorkItems,
                                buffers.curPoints, stepNumber,
                                buffers.partialForces2, buffers.curForces);
    }).fail(function (err) {
        console.error('Kernel faPointEdges failed', err, (err||{}).stack);
    });
}


function swingsTractions(simulator, faSwings) {
    var buffers = simulator.buffers;
    faSwings.set({
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
    return faSwings.exec([simulator.numPoints], resources)
        .fail(function (err) {
            console.error('Kernel faSwingsTractions failed', err, (err||{}).stack);
        });
}


function integrate(simulator, faIntegrate) {
    var buffers = simulator.buffers;
    faIntegrate.set({
        gSpeed: 1.0,
        inputPositions: buffers.curPoints.buffer,
        curForces: buffers.curForces.buffer,
        swings: buffers.swings.buffer,
        outputPositions: buffers.nextPoints.buffer
    });

    var resources = [
        buffers.curPoints,
        buffers.curForces,
        buffers.swings,
        buffers.nextPoints
    ];

    simulator.tickBuffers(['nextPoints']);

    debug("Running kernel faIntegrate");
    return faIntegrate.exec([simulator.numPoints], resources)
        .fail(function (err) {
            console.error('Kernel faIntegrate failed', err, (err||{}).stack);
        });
}

function integrate2(simulator, faIntegrate2) {
    var buffers = simulator.buffers;

    faIntegrate2.set({
        numPoints: simulator.numPoints,
        tau: 1.0,
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
    return faIntegrate2.exec([simulator.numPoints], resources)
        .fail(function (err) {
            console.error('Kernel faIntegrate2 failed', err, (err||{}).stack);
        });
}

function gatherEdges(simulator, gsGather) {
    var buffers = simulator.buffers;
    var resources = [
        buffers.forwardsEdges,
        buffers.curPoints,
        buffers.springsPos
    ];

    var numSprings = simulator.buffers.forwardsEdges.cl.renderer.numEdges; // TODO: Get this a proper way.
    gsGather.set({numSprings: numSprings});

    simulator.tickBuffers(['springsPos']);

    debug("Running gaussSeidelSpringsGather (forceatlas2) kernel");
    return gsGather.exec([simulator.numForwardsWorkItems], resources);
}


ForceAtlas2.prototype.tick = function(simulator, stepNumber) {
    var that = this;
    var tickTime = Date.now();
    return pointForces(simulator, that.faPoints, stepNumber)
    .then(function () {
        return edgeForces(simulator, that.faEdges, stepNumber);
    }).then(function () {
        return swingsTractions(simulator, that.faSwings);
    }).then(function () {
        return integrate(simulator, that.faIntegrate);
        //return integrate2(simulator, that.faIntegrate2);
    }).then(function () {
        var buffers = simulator.buffers;
        simulator.tickBuffers(['curPoints']);
        return Q.all([
            buffers.nextPoints.copyInto(buffers.curPoints),
            buffers.curForces.copyInto(buffers.prevForces)
        ]);
    }).then(function () {
        return gatherEdges(simulator, that.gsGather);
    }).then(function () {
        return simulator;
    });
}


module.exports = ForceAtlas2;

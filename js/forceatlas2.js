'use strict';

var debug = require("debug")("graphistry:graph-viz:cl:forceatlas2"),
    _     = require('underscore'),
    cljs  = require('./cl.js'),
    gs    = require('./gaussseidel.js'),
    Q     = require('q'),
    util  = require('./util.js'),
    webcl = require('node-webcl');

var graphParams = {
    scalingRatio: null,
    gravity: null,
    edgeInfluence: null,
    flags: null
};

var faPoints = {};
_.extend(faPoints, graphParams, {
    tilePointsParam: null,
    tilePointsParam2: null,
    numPoints: null,
    tilesPerIteration: null,
    inputPositions: null,
    width: null,
    height: null,
    stepNumber: null,
    pointDegrees: null,
    pointForces: null
});
var faPointsOrder = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'tilePointsParam',
                     'tilePointsParam2', 'numPoints', 'tilesPerIteration', 'inputPositions',
                     'width', 'height', 'stepNumber', 'pointDegrees', 'pointForces'];
Object.seal(faPoints);

var faEdges = {};
_.extend(faEdges, graphParams, {
    edges: null,
    workList: null,
    inputPoints: null,
    partialForces: null,
    stepNumber: null,
    outputForces: null
});
var faEdgesOrder = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'edges',
                    'workList', 'inputPoints', 'partialForces', 'stepNumber', 'outputForces'];
Object.seal(faEdges);

var faSwings = {
    prevForces: null,
    curForces: null,
    swings: null,
    tractions: null
}
var faSwingsOrder = ['prevForces', 'curForces', 'swings' , 'tractions'];
Object.seal(faSwings);

var faSpeed = {
    tau: null,
    numPoints: null,
    pointDegrees: null,
    swings: null,
    tractions: null,
    gSpeeds : null
}
var faSpeedOrder = ['tau', 'numPoints', 'pointDegrees', 'swings',
                    'tractions', 'gSpeeds'];
Object.seal(faSpeed);

var faIntegrate = {
    gSpeed: null,
    inputPositions: null,
    curForces: null,
    swings: null,
    outputPositions: null
}
var faIntegrateOrder = ['gSpeed', 'inputPositions', 'curForces', 'swings',
                        'outputPositions'];
Object.seal(faIntegrate);

var faIntegrate2 = {
    numPoints: null,
    tau: null,
    inputPositions: null,
    pointDegrees: null,
    curForces: null,
    swings: null,
    tractions: null,
    outputPositions: null
}
var faIntegrate2Order = ['numPoints', 'tau', 'inputPositions', 'pointDegrees',
                         'curForces', 'swings', 'tractions', 'outputPositions'];
Object.seal(faIntegrate2);

var gsSpringsGather = {}
_.extend(gsSpringsGather, gs.gsSpringsGather);

var argsType = {
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
    gSpeed: cljs.types.float_t
}
Object.seal(argsType);

var kernels = [
    {
        name: 'faPointForces',
        args: faPoints,
        order: faPointsOrder,
        types: argsType,
        file: 'forceAtlas2.cl'
    },{
        name: 'faEdgeForces',
        args: faEdges,
        order: faEdgesOrder,
        types: argsType,
        file: 'forceAtlas2.cl'
    },{
        name: 'faSwingsTractions',
        args: faSwings,
        order: faSwingsOrder,
        types: argsType,
        file: 'forceAtlas2.cl'
    },{
        name: 'faGlobalSpeed',
        args: faSpeed,
        order: faSpeedOrder,
        types: argsType,
        file: 'forceAtlas2.cl'
    },{
        name: 'faIntegrate',
        args: faIntegrate,
        order: faIntegrateOrder,
        types: argsType,
        file: 'forceAtlas2.cl'
    },{
        name: 'faIntegrate2',
        args: faIntegrate2,
        order: faIntegrate2Order,
        types: argsType,
        file: 'forceAtlas2.cl'
    },{
        name: 'gaussSeidelSpringsGather',
        args: gsSpringsGather,
        order: gs.gsSpringsGatherOrder,
        types: gs.argsType,
        file: 'gaussSeidel.cl'
    }
];
util.saneKernels(kernels);

var setKernelArgs = cljs.setKernelArgs.bind('', kernels);

function setPhysics(cfg) {
    if ('scalingRatio' in cfg) {
        var val = [cfg.scalingRatio];
        faPoints.scalingRatio = val;
        faEdges.scalingRatio = val;
    }
    if ('gravity' in cfg) {
        var val = [cfg.gravity];
        faPoints.gravity = val;
        faEdges.gravity = val;
    }
    if ('edgeInfluence' in cfg) {
        var val =[cfg.edgeInfluence];
        faPoints.edgeInfluence = val;
        faEdges.edgeInfluence = val;
    }

    var mask = 0;
    var flags = ['preventOverlap', 'strongGravity', 'dissuadeHubs', 'linLog'];
    flags.forEach(function (flag, i) {
        var isOn = cfg.hasOwnProperty(flag) ? cfg[flag] : false;
        if (isOn) {
            mask = mask | (1 << i);
        }
    });
    var val = [mask];
    faPoints.flags = val;
    faEdges.flags = val;
}


function setPoints() {}


function setEdges(simulator) {
        var localPosSize =
            Math.min(simulator.cl.maxThreads, simulator.numMidPoints)
            * simulator.elementsPerPoint
            * Float32Array.BYTES_PER_ELEMENT;

        faPoints.tilePointsParam =[1];
        faPoints.tilePointsParam2 = [1];
        faPoints.tilesPerIteration = [simulator.tilesPerIteration];
        faPoints.numPoints = [simulator.numPoints];
        faPoints.inputPositions = simulator.buffers.curPoints.buffer;
        faPoints.width = [simulator.dimensions[0]];
        faPoints.height = [simulator.dimensions[1]];
        faPoints.pointDegrees = simulator.buffers.degrees.buffer;
        faPoints.pointForces = simulator.buffers.partialForces1.buffer;

        gsSpringsGather.springs = simulator.buffers.forwardsEdges.buffer;
        gsSpringsGather.workList = simulator.buffers.forwardsWorkItems.buffer;
        gsSpringsGather.inputPoints = simulator.buffers.curPoints.buffer;
        gsSpringsGather.springPositions = simulator.buffers.springsPos.buffer;
}

function pointForces(simulator, stepNumber) {
    var resources = [
        simulator.buffers.curPoints,
        simulator.buffers.forwardsDegrees,
        simulator.buffers.backwardsDegrees,
        simulator.buffers.partialForces1
    ];

    faPoints.stepNumber = [stepNumber];
    setKernelArgs(simulator, 'faPointForces');

    simulator.tickBuffers(['partialForces1']);

    debug("Running kernel faPointForces");
    return simulator.kernels.faPointForces.call(simulator.numPoints, resources)
        .fail(function (err) {
            console.error('Kernel faPointForces failed', err, (err||{}).stack);
        });
}

function edgeForcesOneWay(simulator, edges, workItems, numWorkItems, points,
                          stepNumber, partialForces, outputForces) {
    faEdges.edges = edges.buffer;
    faEdges.workList = workItems.buffer;
    faEdges.inputPoints = points.buffer;
    faEdges.stepNumber = [stepNumber];
    faEdges.partialForces = partialForces.buffer;
    faEdges.outputForces = outputForces.buffer;

    setKernelArgs(simulator, 'faEdgeForces');

    var resources = [edges, workItems, points, partialForces, outputForces];

    simulator.tickBuffers(
        _.keys(simulator.buffers).filter(function (name) {
            return simulator.buffers[name] == outputForces;
        })
    );

    debug("Running kernel faEdgeForces");
    return simulator.kernels.faEdgeForces.call(numWorkItems, resources);
}

function edgeForces(simulator, stepNumber) {
    var buffers = simulator.buffers;
    return edgeForcesOneWay(simulator, buffers.forwardsEdges, buffers.forwardsWorkItems,
                            simulator.numForwardsWorkItems, buffers.curPoints,
                            stepNumber,
                            buffers.partialForces1, buffers.partialForces2)
    .then(function () {
        return edgeForcesOneWay(simulator, buffers.backwardsEdges,
                                buffers.backwardsWorkItems,
                                simulator.numBackwardsWorkItems,
                                buffers.curPoints, stepNumber,
                                buffers.partialForces2, buffers.curForces);
    }).fail(function (err) {
        console.error('Kernel faPointEdges failed', err, (err||{}).stack);
    });
}

function swingsTractions(simulator) {
    var buffers = simulator.buffers;
    faSwings.prevForces = buffers.prevForces.buffer;
    faSwings.curForces = buffers.curForces.buffer;
    faSwings.swings = buffers.swings.buffer;
    faSwings.tractions = buffers.tractions.buffer;

    var resources = [
        buffers.prevForces,
        buffers.curForces,
        buffers.swings,
        buffers.tractions
    ];

    setKernelArgs(simulator, 'faSwingsTractions');

    simulator.tickBuffers(['swings', 'tractions']);

    debug("Running kernel faSwingsTractions");
    return simulator.kernels.faSwingsTractions.call(simulator.numPoints, resources)
        .fail(function (err) {
            console.error('Kernel faSwingsTractions failed', err, (err||{}).stack);
        });
}

function integrate(simulator) {
    var buffers = simulator.buffers;
    faIntegrate.gSpeed = [1.0];
    faIntegrate.inputPositions = buffers.curPoints.buffer;
    faIntegrate.curForces = buffers.curForces.buffer;
    faIntegrate.swings = buffers.swings.buffer;
    faIntegrate.outputPositions = buffers.nextPoints.buffer;

    var resources = [
        buffers.curPoints,
        buffers.curForces,
        buffers.swings,
        buffers.nextPoints
    ];

    setKernelArgs(simulator, 'faIntegrate');

    simulator.tickBuffers(['nextPoints']);

    debug("Running kernel faIntegrate");
    return simulator.kernels.faIntegrate.call(simulator.numPoints, resources)
        .fail(function (err) {
            console.error('Kernel faIntegrate failed', err, (err||{}).stack);
        });
}

function integrate2(simulator) {
    var buffers = simulator.buffers;
    faIntegrate2.numPoints = [simulator.numPoints];
    faIntegrate2.tau = [1.0];
    faIntegrate2.inputPositions = buffers.curPoints.buffer;
    faIntegrate2.pointDegrees = buffers.degrees.buffer;
    faIntegrate2.curForces = buffers.curForces.buffer;
    faIntegrate2.swings = buffers.swings.buffer;
    faIntegrate2.tractions = buffers.tractions.buffer;
    faIntegrate2.outputPositions = buffers.nextPoints.buffer;

    var resources = [
        buffers.curPoints,
        buffers.forwardsDegrees,
        buffers.backwardsDegrees,
        buffers.curForces,
        buffers.swings,
        buffers.tractions,
        buffers.nextPoints
    ];

    setKernelArgs(simulator, 'faIntegrate2');

    simulator.tickBuffers(['nextPoints']);

    debug("Running kernel faIntegrate2");
    return simulator.kernels.faIntegrate2.call(simulator.numPoints, resources)
        .fail(function (err) {
            console.error('Kernel faIntegrate2 failed', err, (err||{}).stack);
        });
}

function gatherEdges(simulator) {
    var buffers = simulator.buffers;
    var resources = [
        buffers.forwardsEdges,
        buffers.forwardsWorkItems,
        buffers.curPoints,
        buffers.springsPos
    ];

    simulator.tickBuffers(['springsPos']);

    setKernelArgs(simulator, 'gaussSeidelSpringsGather');

    debug("Running gaussSeidelSpringsGather (forceatlas2) kernel");
    return simulator.kernels.gaussSeidelSpringsGather.call(simulator.numForwardsWorkItems, resources);
}

function tick(simulator, stepNumber) {
    var tickTime = Date.now();
    return pointForces(simulator, stepNumber)
    .then(function () {
        return edgeForces(simulator, stepNumber);
    }).then(function () {
        return swingsTractions(simulator);
    }).then(function () {
        return integrate2(simulator);
    }).then(function () {
        var buffers = simulator.buffers;
        simulator.tickBuffers(['curPoints']);
        return Q.all([
            buffers.nextPoints.copyInto(buffers.curPoints),
            buffers.curForces.copyInto(buffers.prevForces)
        ]);
    }).then(function () {
        return gatherEdges(simulator);
    }).then(function () {

    });
}


module.exports = {
    name: 'forceAtlas2',
    kernels: kernels,
    setPhysics: setPhysics,
    setPoints: setPoints,
    setEdges: setEdges,
    tick: tick
};


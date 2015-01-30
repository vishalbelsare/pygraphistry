'use strict';

var debug = require("debug")("graphistry:graph-viz:cl:forceatlas2"),
    _     = require('underscore'),
    cljs  = require('./cl.js'),
    gs    = require('./gaussseidel.js'),
    Q     = require('q'),
    util  = require('./util.js'),
    webcl = require('node-webcl');



var faPointsOrder = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', /*'tilePointsParam',
                     'tilePointsParam2',*/ 'numPoints', 'inputPositions',
                     'width', 'height', 'stepNumber', 'pointDegrees', 'pointForces'];
var faPoints = _.object(faPointsOrder.map(function (name) { return [name, null]; }));
Object.seal(faPoints);


var faEdgesOrder = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'edges',
                    'workList', 'inputPoints', 'partialForces', 'stepNumber', 'outputForces'];
var faEdges = _.object(faEdgesOrder.map(function (name) { return [name, null]; }));
Object.seal(faEdges);

var faSwingsOrder = ['prevForces', 'curForces', 'swings' , 'tractions'];
var faSwings = _.object(faSwingsOrder.map(function (name) { return [name, null]; }));
Object.seal(faSwings);

var faIntegrateOrder = ['gSpeed', 'inputPositions', 'curForces', 'swings',
                        'outputPositions'];
var faIntegrate = _.object(faIntegrateOrder.map(function (name) { return [name, null]; }));
Object.seal(faIntegrate);

var faIntegrate2Order = ['numPoints', 'tau', 'inputPositions', 'pointDegrees',
                         'curForces', 'swings', 'tractions', 'outputPositions'];
var faIntegrate2 = _.object(faIntegrate2Order.map(function (name) { return [name, null]; }));
Object.seal(faIntegrate2);

var gsSpringsGather = {}
_.extend(gsSpringsGather, gs.gsSpringsGather);

var argsType = {
    scalingRatio: cljs.types.float_t,
    gravity: cljs.types.float_t,
    edgeInfluence: cljs.types.uint_t,
    flags: cljs.types.uint_t,
    numPoints: cljs.types.uint_t,
    tilePointsParam: cljs.types.local_t,
    tilePointsParam2: cljs.types.local_t,
    inputPositions: cljs.types.global_t,
    pointForces: cljs.types.global_t,
    partialForces: cljs.types.global_t,
    outputForces: cljs.types.global_t,
    outputPositions: cljs.types.global_t,
    width: cljs.types.float_t,
    height: cljs.types.float_t,
    stepNumber: cljs.types.uint_t,
    pointDegrees: cljs.types.global_t,
    edges: cljs.types.global_t,
    workList: cljs.types.global_t,
    inputPoints: cljs.types.global_t,
    outputPoints: cljs.types.global_t,
    curForces: cljs.types.global_t,
    prevForces: cljs.types.global_t,
    swings: cljs.types.global_t,
    tractions: cljs.types.global_t,
    gSpeeds: cljs.types.global_t,
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
        faPoints.scalingRatio = cfg.scalingRatio;
        faEdges.scalingRatio = cfg.scalingRatio;
    }
    if ('gravity' in cfg) {
        faPoints.gravity = cfg.gravity;
        faEdges.gravity = cfg.gravity;
    }
    if ('edgeInfluence' in cfg) {
        faPoints.edgeInfluence = cfg.edgeInfluence;
        faEdges.edgeInfluence = cfg.edgeInfluence;
    }

    var mask = 0;
    var flags = ['preventOverlap', 'strongGravity', 'dissuadeHubs', 'linLog'];
    flags.forEach(function (flag, i) {
        var isOn = cfg.hasOwnProperty(flag) ? cfg[flag] : false;
        if (isOn) {
            mask = mask | (1 << i);
        }
    });
    faPoints.flags = mask;
    faEdges.flags = mask;
}


function setPoints() {}


function setEdges(simulator) {
        var localPosSize =
            Math.min(simulator.cl.maxThreads, simulator.numMidPoints)
            * simulator.elementsPerPoint
            * Float32Array.BYTES_PER_ELEMENT;

        //faPoints.tilePointsParam = [1];
        //faPoints.tilePointsParam2 = [1];
        faPoints.numPoints = simulator.numPoints;
        faPoints.inputPositions = simulator.buffers.curPoints.buffer;
        faPoints.width = simulator.dimensions[0];
        faPoints.height = simulator.dimensions[1];
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

    faPoints.stepNumber = stepNumber;
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
    faEdges.stepNumber = stepNumber;
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
    faIntegrate.gSpeed = 1.0;
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
    faIntegrate2.numPoints = simulator.numPoints;
    faIntegrate2.tau = 1.0;
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


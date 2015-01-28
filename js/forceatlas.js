'use strict';

var debug = require("debug")("graphistry:graph-viz:cl:forceatlas"),
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
    tilePointsParam3: null,
    numPoints: null,
    inputPositions: null,
    width: null,
    height: null,
    stepNumber: null,
    inDegrees: null,
    outDegrees: null,
    outputPositions: null
});
var faPointsOrder = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'tilePointsParam',
                     'tilePointsParam2', 'tilePointsParam3', 'numPoints', 'inputPositions',
                     'width', 'height', 'stepNumber', 'inDegrees', 'outDegrees', 'outputPositions'];
Object.seal(faPoints);

var faEdges = {};
_.extend(faEdges, graphParams, {
    springs: null,
    workList: null,
    inputPoints: null,
    stepNumber: null,
    outputPoints: null
});
var faEdgesOrder = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'springs',
                    'workList', 'inputPoints', 'stepNumber', 'outputPoints'];
Object.seal(faEdges);

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
    tilePointsParam3: cljs.types.local_t,
    inputPositions: null,
    outputPositions: null,
    width: cljs.types.float_t,
    height: cljs.types.float_t,
    stepNumber: cljs.types.uint_t,
    inDegrees: null,
    outDegrees: null,
    springs: null,
    workList: null,
    inputPoints: null,
    outputPoints: null,
}
Object.seal(argsType);

var kernels = [
    {
        name: "forceAtlasPoints",
        args: faPoints,
        order: faPointsOrder,
        types: argsType,
        file: 'forceAtlas.cl'
    },{
        name: "forceAtlasEdges",
        args: faEdges,
        order: faEdgesOrder,
        types: argsType,
        file: 'forceAtlas.cl'
    },{
        name: "gaussSeidelSpringsGather",
        args: gsSpringsGather,
        order: gs.gsSpringsGatherOrder,
        types: gs.argsType,
        file: 'gaussSeidel.cl'
    }
]
util.saneKernels(kernels);

var setKernelArgs = cljs.setKernelArgs.bind('', kernels);

function setPhysics(cfg) {
    if ('scalingRatio' in cfg) {
        faPoints.scalingRatio = [cfg.scalingRatio];
        faEdges.scalingRatio = [cfg.scalingRatio];
    }
    if ('gravity' in cfg) {
        faPoints.gravity = [cfg.gravity];
        faEdges.gravity = [cfg.gravity];
    }
    if ('edgeInfluence' in cfg) {
        faPoints.edgeInfluence = [cfg.edgeInfluence];
        faEdges.edgeInfluence = [cfg.edgeInfluence];
    }

    var mask = 0;
    var flags = ['preventOverlap', 'strongGravity', 'dissuadeHubs', 'linLog'];
    flags.forEach(function (flag, i) {
        var isOn = cfg.hasOwnProperty(flag) ? cfg[flag] : false;
        if (isOn) {
            mask = mask | (1 << i);
        }
    });
    faPoints.flags = [mask];
    faEdges.flags = [mask];
}

function setEdges(simulator) {
    var localPosSize =
        Math.min(simulator.cl.maxThreads, simulator.numMidPoints)
        * simulator.elementsPerPoint
        * Float32Array.BYTES_PER_ELEMENT;

    faPoints.tilePointsParam = [1];
    faPoints.tilePointsParam2 = [1];
    faPoints.tilePointsParam3 = [1];
    faPoints.numPoints = [simulator.numPoints];
    faPoints.inputPositions = simulator.buffers.curPoints.buffer;
    faPoints.width = [simulator.dimensions[0]];
    faPoints.height = [simulator.dimensions[1]];
    faPoints.inDegrees = simulator.buffers.forwardsDegrees.buffer;
    faPoints.outDegrees = simulator.buffers.backwardsDegrees.buffer;
    faPoints.outputPositions = simulator.buffers.nextPoints.buffer;

    gsSpringsGather.springs = simulator.buffers.forwardsEdges.buffer;
    gsSpringsGather.workList = simulator.buffers.forwardsWorkItems.buffer;
    gsSpringsGather.inputPoints = simulator.buffers.curPoints.buffer;
    gsSpringsGather.springPositions = simulator.buffers.springsPos.buffer;
}

function tick(simulator, stepNumber) {
    var tickTime = Date.now()

    var atlasEdgesKernelSeq = function (edges, workItems, numWorkItems, fromPoints, toPoints) {

        var resources = [edges, workItems, fromPoints, toPoints];

        faEdges.springs = edges.buffer;
        faEdges.workList = workItems.buffer;
        faEdges.inputPoints = fromPoints.buffer;
        faEdges.outputPoints = toPoints.buffer;
        faEdges.stepNumber = [stepNumber];
        setKernelArgs(simulator, 'forceAtlasEdges');

        simulator.tickBuffers(
            _.keys(simulator.buffers).filter(function (name) {
                return simulator.buffers[name] == toPoints;
            }));

        debug("Running kernel forceAtlasEdges");
        return simulator.kernels.forceAtlasEdges.call(numWorkItems, resources);
    };

    var resources = [
        simulator.buffers.curPoints,
        simulator.buffers.forwardsDegrees,
        simulator.buffers.backwardsDegrees,
        simulator.buffers.nextPoints
    ];

    faPoints.stepNumber = [stepNumber];
    setKernelArgs(simulator, "forceAtlasPoints");

    simulator.tickBuffers(['nextPoints', 'curPoints', 'springsPos'])

    debug("Running kernel forceAtlasPoints");
    var appliedForces;
    if (simulator.locked.lockPoints) {
        debug('Locked points, skipping');
        appliedForces = simulator.buffers.curPoints.copyInto(simulator.buffers.nextPoints);
    } else {
        appliedForces = simulator.kernels.forceAtlasPoints.call(simulator.numPoints, resources)
        .then(function () {
            //FIXME this shouldn't be necessary -- is the next kernel not copying existing vals or swapping buffers somehow?
            return simulator.buffers.nextPoints.copyInto(simulator.buffers.curPoints);
        });
    }

    return appliedForces
        .then(function() {
            if (simulator.locked.lockEdges) {
                debug('Locked edges, skipping');
                return simulator.buffers.nextPoints.copyInto(simulator.buffers.curPoints);
            } else if(simulator.numEdges > 0) {
                return Q()
                    .then(function () {
                        //debug('SKIP FORWARDS');
                        //return simulator.buffers.nextPoints.copyInto(simulator.buffers.curPoints);
                        debug('forwards');
                        return atlasEdgesKernelSeq(
                            simulator.buffers.forwardsEdges, simulator.buffers.forwardsWorkItems, simulator.numForwardsWorkItems,
                            simulator.buffers.nextPoints, simulator.buffers.curPoints)

                    })
                    .then(function () {
                        //FIXME this shouldn't be necessary -- is the next kernel not copying existing vals or swapping buffers somehow?
                        return simulator.buffers.curPoints.copyInto(simulator.buffers.nextPoints);
                    })
                    .then(function () {
                        //debug('SKIP BACKWARDS');
                        //return simulator.buffers.curPoints.copyInto(simulator.buffers.nextPoints);
                        return atlasEdgesKernelSeq(
                            simulator.buffers.backwardsEdges, simulator.buffers.backwardsWorkItems, simulator.numBackwardsWorkItems,
                            simulator.buffers.curPoints, simulator.buffers.nextPoints);
                    })
                    .then(function () {
                        return simulator.buffers.nextPoints.copyInto(simulator.buffers.curPoints);
                    }).fail(function (err) {
                        console.error("ERROR: appliedForces failed ", (err|{}).stack);
                    });
            }
        })
        .then(function () {
            if (simulator.numEdges > 0) {

                var resources = [simulator.buffers.forwardsEdges, simulator.buffers.forwardsWorkItems,
                    simulator.buffers.curPoints, simulator.buffers.springsPos];

                setKernelArgs(simulator, 'gaussSeidelSpringsGather');

                debug("Running gaussSeidelSpringsGather (forceatlas) kernel");
                return simulator.kernels.gaussSeidelSpringsGather.call(simulator.numForwardsWorkItems, resources);
            }
        }).fail(function (err) {
            console.error("ERROR forcealtas tick failed: ", (err||{}).stack);
        });
}

module.exports = {
    name: 'forceAtlas',
    kernels: kernels,
    setPhysics: setPhysics,
    setPoints: _.identity,
    setEdges: setEdges,
    tick: tick
};

'use strict';

var debug = require("debug")("graphistry:graph-viz:forceatlas"),
    _     = require('underscore'),
    cljs  = require('./cl.js'),
    gs    = require('./gaussseidel.js');


if (typeof(window) == 'undefined') {
    var webcl = require('node-webcl');
} else if (typeof(webcl) == 'undefined') {
    var webcl = window.webcl;
}

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

module.exports = {
    name: "forceAtlas",
    kernels: [
        {
            name: "forceAtlasPoints",
            args: faPoints,
            order: faPointsOrder,
            types: argsType
        },{
            name: "forceAtlasEdges",
            args: faEdges,
            order: faEdgesOrder,
            types: argsType
        },{
            name: "gaussSeidelSpringsGather",
            args: gsSpringsGather,
            order: gs.gsSpringsGatherOrder,
            types: gs.argsType
        }
    ],

    setPhysics: function (cfg) {
        if ('scalingRatio' in cfg) {
            var val = webcl.type ? [cfg.scalingRatio] : new Float32Array([cfg.scalingRatio]);
            faPoints.scalingRatio = val;
            faEdges.scalingRatio = val;
        }
        if ('gravity' in cfg) {
            var val = webcl.type ? [cfg.gravity] : new Float32Array([cfg.gravity]);
            faPoints.gravity = val;
            faEdges.gravity = val;
        }
        if ('edgeInfluence' in cfg) {
            var val = webcl.type ? [cfg.edgeInfluence] : new Uint32Array([cfg.edgeInfluence]);
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
        var val = webcl.type ? [mask] : new Uint32Array([mask]);
        faPoints.flags = val;
        faEdges.flags = val;
    },

    setPoints: _.identity,

    setEdges: function (simulator) {

        var localPosSize =
            Math.min(simulator.cl.maxThreads, simulator.numMidPoints)
            * simulator.elementsPerPoint
            * Float32Array.BYTES_PER_ELEMENT;

        faPoints.tilePointsParam = webcl.type ? [1] : new Uint32Array([localPosSize]);
        faPoints.tilePointsParam2 = webcl.type ? [1] : new Uint32Array([localPosSize]);
        faPoints.tilePointsParam3 = webcl.type ? [1] : new Uint32Array([localPosSize]);
        faPoints.numPoints = webcl.type ? [simulator.numPoints] : new Uint32Array([simulator.numPoints]);
        faPoints.inputPositions = simulator.buffers.curPoints.buffer;
        faPoints.width = webcl.type ? [simulator.dimensions[0]] : new Float32Array([simulator.dimensions[0]]);
        faPoints.height = webcl.type ? [simulator.dimensions[1]] : new Float32Array([simulator.dimensions[1]]);
        faPoints.inDegrees = simulator.buffers.forwardsDegrees.buffer;
        faPoints.outDegrees = simulator.buffers.backwardsDegrees.buffer;
        faPoints.outputPositions = simulator.buffers.nextPoints.buffer;

        gsSpringsGather.springs = simulator.buffers.forwardsEdges.buffer;
        gsSpringsGather.workList = simulator.buffers.forwardsWorkItems.buffer;
        gsSpringsGather.inputPoints = simulator.buffers.curPoints.buffer;
        gsSpringsGather.springPositions = simulator.buffers.springsPos.buffer;
    },

    tick: function (simulator, stepNumber) {
        var tickTime = Date.now()

        var atlasEdgesKernelSeq = function (edges, workItems, numWorkItems, fromPoints, toPoints) {

            var resources = [edges, workItems, fromPoints, toPoints];

            faEdges.springs = edges.buffer; 
            faEdges.workList = workItems.buffer;
            faEdges.inputPoints = fromPoints.buffer; 
            faEdges.outputPoints = toPoints.buffer;
            faEdges.stepNumber = webcl.type ? [stepNumber] : new Uint32Array([stepNumber]);
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
            simulator.buffers.nextPoints,
            simulator.buffers.springsPos
        ];

        faPoints.stepNumber = webcl.type ? [stepNumber] : new Uint32Array([stepNumber]);
        setKernelArgs(simulator, "forceAtlasPoints");

        simulator.tickBuffers(['nextPoints', 'curPoints', 'springsPos'])
        debug("Running kernel forceAtlasPoints");
        var appliedForces = simulator.kernels.forceAtlasPoints.call(simulator.numPoints, resources);

        return appliedForces
            .then(function() {
                if(simulator.numEdges > 0) {
                    return atlasEdgesKernelSeq(
                            simulator.buffers.forwardsEdges, simulator.buffers.forwardsWorkItems, simulator.numForwardsWorkItems,
                            simulator.buffers.nextPoints, simulator.buffers.curPoints)
                        .then(function () {
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
};
var setKernelArgs = cljs.setKernelArgs.bind('', module.exports.kernels)

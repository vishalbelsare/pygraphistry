'use strict';

var debug = require("debug")("graphistry:graph-viz:cl:gaussseidel")
var Q = require('q');
var _ = require('underscore');
var cljs = require('./cl.js');
var webcl = require('node-webcl');
var util = require('./util');

var gsPointsOrder = ['numPoints',  'inputPositions', 'outputPositions', /*'tilePointsParam',*/
                     'width', 'height', 'charge', 'gravity', 'randValues', 'stepNumber'];
var gsPoints = _.object(gsPointsOrder.map(function (name) { return [name, null]; }));
Object.seal(gsPoints);


var gsSpringsOrder = ['springs', 'workList', 'edgeTags', 'inputPoints', 'outputPoints',
                      'edgeStrength0', 'edgeDistance0', 'edgeStrength1', 'edgeDistance1',
                      'stepNumber'];
var gsSprings = _.object(gsSpringsOrder.map(function (name) { return [name, null]; }));
Object.seal(gsSprings);

var gsSpringsGatherOrder = ['springs', 'workList', 'inputPoints', 'springPositions'];
var gsSpringsGather = _.object(gsSpringsGatherOrder.map(function (name) { return [name, null]; }));
Object.seal(gsSpringsGather);

var argsType = {
    numPoints: cljs.types.uint_t,
    edgeTags: cljs.types.global_t,
    inputPositions: cljs.types.global_t,
    outputPositions: cljs.types.global_t,
    tilePointsParam: cljs.types.local_t,
    width: cljs.types.float_t,
    height: cljs.types.float_t,
    charge: cljs.types.float_t,
    gravity: cljs.types.float_t,
    randValues: cljs.types.global_t,
    stepNumber: cljs.types.uint_t,
    springs: cljs.types.global_t,
    workList: cljs.types.global_t,
    inputPoints: cljs.types.global_t,
    outputPoints: cljs.types.global_t,
    edgeStrength0: cljs.types.float_t,
    edgeDistance0: cljs.types.float_t,
    edgeStrength1: cljs.types.float_t,
    edgeDistance1: cljs.types.float_t,
    springPositions: cljs.types.global_t
};
Object.seal(argsType);

var kernels = [
    {
        name: "gaussSeidelPoints",
        args: gsPoints,
        order: gsPointsOrder,
        types: argsType,
        file: 'gaussSeidel.cl'
    },{
        name: "gaussSeidelSprings",
        args: gsSprings,
        order: gsSpringsOrder,
        types: argsType,
        file: 'gaussSeidel.cl'
    },{
        name: "gaussSeidelSpringsGather",
        args: gsSpringsGather,
        order: gsSpringsGatherOrder,
        types: argsType,
        file: 'gaussSeidel.cl'
    }
];
util.saneKernels(kernels);

var setKernelArgs = cljs.setKernelArgs.bind('', kernels);

function setPhysics(cfg) {
    [
        [ gsPoints, ['charge', 'gravity'] ],
        [ gsSprings, ['edgeDistance0', 'edgeStrength0', 'edgeDistance1', 'edgeStrength1'] ]
    ].forEach(function (kernelPair) {
        kernelPair[1].forEach(function (arg) {
            if (arg in cfg) {
                kernelPair[0][arg] = cfg[arg];
            }
        });
    });
}

function setPoints(simulator) {
    var localPosSize =
        Math.min(simulator.cl.maxThreads, simulator.numPoints)
        * simulator.elementsPerPoint
        * Float32Array.BYTES_PER_ELEMENT;

    debug("Setting point 0. FIXME: dyn alloc __local, not hardcode in kernel");

    gsPoints.numPoints = simulator.numPoints;
    gsPoints.inputPositions = simulator.buffers.curPoints.buffer;
    gsPoints.outputPositions = simulator.buffers.nextPoints.buffer;
    //gsPoints.tilePointsParam = [1];
    gsPoints.width = simulator.dimensions[0];
    gsPoints.height = simulator.dimensions[1];
    gsPoints.randValues = simulator.buffers.randValues.buffer;
}

function setEdges(simulator) {
    gsSprings.springs = null;
    gsSprings.workList = null;
    gsSprings.inputPoints = null;
    gsSprings.outputPoints = null;
    gsSprings.stepNumber = null;

    gsSpringsGather.springs = simulator.buffers.forwardsEdges.buffer;
    gsSpringsGather.workList = simulator.buffers.forwardsWorkItems.buffer;
    gsSpringsGather.inputPoints = simulator.buffers.curPoints.buffer;
    gsSpringsGather.springPositions = simulator.buffers.springsPos.buffer;
}

function tick(simulator, stepNumber) {
    var edgeKernelSeq = function  (edges, workItems, numWorkItems, fromPoints, toPoints, edgeTags) {

        debug('edgeKernelSeq');

        var resources = [edges, workItems, fromPoints, toPoints, simulator.buffers.springsPos];

        gsSprings.springs = edges.buffer;
        gsSprings.workList = workItems.buffer;
        gsSprings.inputPoints = fromPoints.buffer;
        gsSprings.outputPoints = toPoints.buffer;
        gsSprings.stepNumber = stepNumber;
        gsSprings.edgeTags = edgeTags.buffer;

        setKernelArgs(simulator, "gaussSeidelSprings");

        simulator.tickBuffers(
            _.keys(simulator.buffers).filter(function (name) {
                return simulator.buffers[name] == toPoints;
            }));

        debug("Running gaussSeidelSprings");
        return simulator.kernels.gaussSeidelSprings.call(numWorkItems, resources);
    };

    return Q()
    .then(function () {

        if (simulator.locked.lockPoints) {
            debug("Points are locked, nothing to do.")
            return;
        } else {

            var resources = [simulator.buffers.curPoints, simulator.buffers.nextPoints, simulator.buffers.randValues];

            gsPoints.stepNumber = stepNumber;
            setKernelArgs(simulator, "gaussSeidelPoints");

            simulator.tickBuffers(['nextPoints', 'curPoints']);

            debug("Running gaussSeidelPoints");
            return simulator.kernels.gaussSeidelPoints.call(simulator.numPoints, resources)
                .then(function () {
                    return simulator.buffers.nextPoints.copyInto(simulator.buffers.curPoints);
                }).fail(function (err) {
                    console.error("ERROR Kernel gaussSeidelPoints failed ", (err||{}).stack)
                });
        }
    }).then(function() {
        if (simulator.numEdges <= 0 || simulator.locked.lockEdges) {
            debug("Edges are locked, nothing to do.")
            return simulator;
        }
        if(simulator.numEdges > 0) {
            return edgeKernelSeq(
                    simulator.buffers.forwardsEdges, simulator.buffers.forwardsWorkItems, simulator.numForwardsWorkItems,
                    simulator.buffers.curPoints, simulator.buffers.nextPoints, simulator.buffers.edgeTags)
                .then(function () {
                        return edgeKernelSeq(
                        simulator.buffers.backwardsEdges, simulator.buffers.backwardsWorkItems, simulator.numBackwardsWorkItems,
                        simulator.buffers.nextPoints, simulator.buffers.curPoints, simulator.buffers.edgeTags_reverse);
                }).fail(function (err) {
                    console.error("ERROR edgeKernelSeq failed ", (err||{}).stack)
                });
        }
    }).then(function() {
        if ((!simulator.locked.lockPoints || !simulator.locked.lockEdges)
            && simulator.numEdges > 0) {

            var resources = [simulator.buffers.forwardsEdges, simulator.buffers.forwardsWorkItems,
                simulator.buffers.curPoints, simulator.buffers.springsPos];

            simulator.tickBuffers(['springsPos']);

            gsSpringsGather.springs = simulator.buffers.forwardsEdges.buffer;
            gsSpringsGather.workList = simulator.buffers.forwardsWorkItems.buffer;
            gsSpringsGather.inputPoints = simulator.buffers.curPoints.buffer;
            gsSpringsGather.springPositions = simulator.buffers.springsPos.buffer;

            setKernelArgs(simulator, "gaussSeidelSpringsGather");

            debug("Running gaussSeidelSpringsGather");
            return simulator.kernels.gaussSeidelSpringsGather.call(simulator.numForwardsWorkItems, resources);

        } else {
            return simulator;
        }
    }).fail(function (err) {
        console.error("ERROR GaussSeidel tick failed ", (err||{}).stack)
    });
}

module.exports = {
    name: "gaussSeidel",
    kernels: kernels,
    setPhysics: setPhysics,
    setPoints: setPoints,
    setEdges: setEdges,
    tick: tick,
    // Also used by forceatlas
    gsSpringsGather: gsSpringsGather,
    gsSpringsGatherOrder: gsSpringsGatherOrder,
    argsType: argsType,
}

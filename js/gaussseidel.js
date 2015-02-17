'use strict'

var debug = require("debug")("graphistry:graph-viz:cl:gaussseidel")
var Q = require('q');
var _ = require('underscore');
var cljs = require('./cl.js');
var webcl = require('node-webcl');
var util = require('./util');
var LayoutAlgo = require('./layoutAlgo.js');
var Kernel = require('./kernel.js');

function GaussSeidel(clContext) {
    LayoutAlgo.call(this, 'GaussSeidel');

    debug('Creating GaussSeidel kernels');
    this.gsPoints = new Kernel('gaussSeidelPoints', GaussSeidel.argsPoints,
                               GaussSeidel.argsType, 'gaussSeidel.cl', clContext);

    this.gsSprings = new Kernel('gaussSeidelSprings', GaussSeidel.argsSprings,
                                GaussSeidel.argsType, 'gaussSeidel.cl', clContext);

    this.gsGather = new Kernel('gaussSeidelSpringsGather', GaussSeidel.argsGather,
                               GaussSeidel.argsType, 'gaussSeidel.cl', clContext);

    this.kernels = this.kernels.concat([this.gsPoints, this.gsSprings, this.gsGather]);
}
GaussSeidel.prototype = Object.create(LayoutAlgo.prototype);
GaussSeidel.prototype.constructor = GaussSeidel;


GaussSeidel.argsPoints = ['numPoints', 'tilesPerIteration', 'inputPositions',
                          'outputPositions', 'tilePointsParam', 'width', 'height',
                          'charge', 'gravity', 'randValues', 'stepNumber'];

GaussSeidel.argsSprings = ['tilesPerIteration', 'springs', 'workList', 'edgeTags',
                           'inputPoints', 'outputPoints', 'edgeStrength0', 'edgeDistance0', 'edgeStrength1', 'edgeDistance1', 'stepNumber'];

GaussSeidel.argsGather = ['springs', 'inputPoints', 'numSprings', 'springPositions'];

GaussSeidel.argsType = {
    numPoints: cljs.types.uint_t,
    tilesPerIteration: cljs.types.uint_t,
    edgeTags: null,
    inputPositions: null,
    outputPositions: null,
    tilePointsParam: cljs.types.local_t,
    width: cljs.types.float_t,
    height: cljs.types.float_t,
    charge: cljs.types.float_t,
    gravity: cljs.types.float_t,
    randValues: null,
    stepNumber: cljs.types.uint_t,
    springs: null,
    workList: null,
    inputPoints: null,
    outputPoints: null,
    edgeStrength0: cljs.types.float_t,
    edgeDistance0: cljs.types.float_t,
    edgeStrength1: cljs.types.float_t,
    edgeDistance1: cljs.types.float_t,
    numSprings: cljs.types.uint_t,
    springPositions: null
};


GaussSeidel.prototype.setPoints = function(simulator) {
    var localPosSize =
        Math.min(simulator.cl.maxThreads, simulator.numPoints)
        * simulator.elementsPerPoint
        * Float32Array.BYTES_PER_ELEMENT;

    this.gsPoints.set({
        numPoints: simulator.numPoints,
        tilesPerIteration: simulator.tilesPerIteration,
        inputPositions: simulator.buffers.curPoints.buffer,
        outputPositions: simulator.buffers.nextPoints.buffer,
        tilePointsParam: 1,
        width: simulator.dimensions[0],
        height: simulator.dimensions[1],
        randValues: simulator.buffers.randValues.buffer,
        stepNumber: 0,
    });
}


GaussSeidel.prototype.setEdges = function(simulator) {
    this.gsSprings.set({
        tilesPerIteration: simulator.tilesPerIteration
    });
    this.gsGather.set({
        springs: simulator.buffers.forwardsEdges.buffer,
        inputPoints: simulator.buffers.curPoints.buffer,
        numSprings: simulator.numEdges,
        springPositions: simulator.buffers.springsPos.buffer,
    });
}

function pointKernel(simulator, gsPoints, stepNumber) {
    var resources = [simulator.buffers.curPoints, simulator.buffers.nextPoints,
                     simulator.buffers.randValues];

    gsPoints.set({stepNumber: stepNumber});

    simulator.tickBuffers(['nextPoints', 'curPoints']);

    debug("Running gaussSeidelPoints");
    return gsPoints.exec([simulator.numPoints], resources)
        .then(function () {
            return simulator.buffers.nextPoints.copyInto(simulator.buffers.curPoints);
        }).fail(function (err) {
            console.error("ERROR Kernel gaussSeidelPoints failed ", (err||{}).stack)
        });
}


function edgeKernelSeq(simulator, gsSprings, stepNumber, edges, workItems,
                       numWorkItems, fromPoints, toPoints, edgeTags) {
    debug('edgeKernelSeq');

    var resources = [edges, workItems, fromPoints, toPoints, simulator.buffers.springsPos];

    gsSprings.set({
        springs: edges.buffer,
        workList: workItems.buffer,
        inputPoints: fromPoints.buffer,
        outputPoints: toPoints.buffer,
        stepNumber: stepNumber,
        edgeTags: edgeTags.buffer,
    });

    simulator.tickBuffers(
        _.keys(simulator.buffers).filter(function (name) {
            return simulator.buffers[name] == toPoints;
        }));

    debug('Running gaussSeidelSprings');
    return gsSprings.exec([numWorkItems], resources);
}


function gatherKernel(simulator, gsGather) {
    var resources = [
        simulator.buffers.forwardsEdges,
        simulator.buffers.curPoints, simulator.buffers.springsPos
    ];

    simulator.tickBuffers(['springsPos']);

    gsGather.set({
        springs: simulator.buffers.forwardsEdges.buffer,
        inputPoints: simulator.buffers.curPoints.buffer,
        springPositions: simulator.buffers.springsPos.buffer,
    });

    var numSprings = simulator.numEdges;
    gsGather.set({numSprings: numSprings});

    debug("Running gaussSeidelSpringsGather");
    return gsGather.exec([simulator.numForwardsWorkItems], resources);
}


GaussSeidel.prototype.tick = function(simulator, stepNumber) {
    var that = this;
    return Q().then(function () {
        if (simulator.locked.lockPoints) {
            debug("Points are locked, nothing to do.")
        } else {
            return pointKernel(simulator, that.gsPoints, stepNumber);
        }
    }).then(function() {
        if (simulator.numEdges <= 0 || simulator.locked.lockEdges) {
            debug("Edges are locked, nothing to do.")
            return simulator;
        }
        return edgeKernelSeq(
                simulator, that.gsSprings, stepNumber,
                simulator.buffers.forwardsEdges, simulator.buffers.forwardsWorkItems, simulator.numForwardsWorkItems,
                simulator.buffers.curPoints, simulator.buffers.nextPoints, simulator.buffers.edgeTags)
            .then(function () {
                    return edgeKernelSeq(
                    simulator, that.gsSprings, stepNumber,
                    simulator.buffers.backwardsEdges, simulator.buffers.backwardsWorkItems, simulator.numBackwardsWorkItems,
                    simulator.buffers.nextPoints, simulator.buffers.curPoints, simulator.buffers.edgeTags_reverse);
            }).fail(function (err) {
                console.error("ERROR edgeKernelSeq failed ", (err||{}).stack)
            });
    }).then(function() {
        if ((!simulator.locked.lockPoints || !simulator.locked.lockEdges)
            && simulator.numEdges > 0) {
            return gatherKernel(simulator, that.gsGather)
        }
    }).then(function () {
        return simulator;
    }).fail(function (err) {
        console.error("ERROR GaussSeidel tick failed ", (err||{}).stack)
    });
}

module.exports = GaussSeidel;

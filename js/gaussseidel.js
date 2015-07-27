// TODO: Convert to use dataframe.

'use strict'

var Q = require('q');
var _ = require('underscore');
var cljs = require('./cl.js');
var webcl = require('node-webcl');
var LayoutAlgo = require('./layoutAlgo.js');
var Kernel = require('./kernel.js');

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz:cl:gaussseidel');

function GaussSeidel(clContext) {
    LayoutAlgo.call(this, GaussSeidel.name);

    logger.trace('Creating GaussSeidel kernels');
    this.gsPoints = new Kernel('gaussSeidelPoints', GaussSeidel.argsPoints,
                               GaussSeidel.argsType, 'gaussSeidel.cl', clContext);

    this.gsSprings = new Kernel('gaussSeidelSprings', GaussSeidel.argsSprings,
                                GaussSeidel.argsType, 'gaussSeidel.cl', clContext);

    this.kernels = this.kernels.concat([this.gsPoints, this.gsSprings]);
}
GaussSeidel.prototype = Object.create(LayoutAlgo.prototype);
GaussSeidel.prototype.constructor = GaussSeidel;

GaussSeidel.name = 'GaussSeidel';
GaussSeidel.argsPoints = ['numPoints', 'tilesPerIteration', 'inputPositions',
                          'outputPositions', 'tilePointsParam', 'width', 'height',
                          'charge', 'gravity', 'randValues', 'stepNumber'];

GaussSeidel.argsSprings = ['tilesPerIteration', 'springs', 'workList', 'edgeTags',
                           'inputPoints', 'outputPoints', 'edgeStrength0', 'edgeDistance0', 'edgeStrength1', 'edgeDistance1', 'stepNumber'];

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
        width: simulator.controls.global.dimensions[0],
        height: simulator.controls.global.dimensions[1],
        randValues: simulator.buffers.randValues.buffer,
        stepNumber: 0,
    });
}


GaussSeidel.prototype.setEdges = function(simulator) {
    this.gsSprings.set({
        tilesPerIteration: simulator.tilesPerIteration
    });
}

function pointKernel(simulator, gsPoints, stepNumber) {
    var resources = [simulator.buffers.curPoints, simulator.buffers.nextPoints,
                     simulator.buffers.randValues];

    gsPoints.set({stepNumber: stepNumber});

    simulator.tickBuffers(['nextPoints', 'curPoints']);

    logger.trace("Running gaussSeidelPoints");
    return gsPoints.exec([simulator.numPoints], resources)
        .then(function () {
            return simulator.buffers.nextPoints.copyInto(simulator.buffers.curPoints);
        }).fail(log.makeQErrorHandler(logger, 'Kernel gaussSeidelPoints failed'));
}


function edgeKernelSeq(simulator, gsSprings, stepNumber, edges, workItems,
                       numWorkItems, fromPoints, toPoints, edgeTags) {
    logger.trace('edgeKernelSeq');

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

    logegr.trace('Running gaussSeidelSprings');
    return gsSprings.exec([numWorkItems], resources)
        .fail(log.makeQErrorHandler(logger, 'Kernel gaussSeidelSprings failed'));
}


GaussSeidel.prototype.tick = function(simulator, stepNumber) {
    var that = this;
    var locks = simulator.controls.locks;
    return Q().then(function () {
        if (locks.lockPoints) {
            logger.trace("Points are locked, nothing to do.")
        } else {
            return pointKernel(simulator, that.gsPoints, stepNumber);
        }
    }).then(function() {
        if (simulator.numEdges <= 0 || locks.lockEdges) {
            logger.trace("Edges are locked, nothing to do.")
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
            }).fail(log.makeQErrorHandler(logger, 'edgeKernelSeq failed'));
    }).then(function () {
        return simulator;
    }).fail(log.makeQErrorHandler(logger, 'GaussSeidel tick failed'));
}

module.exports = GaussSeidel;

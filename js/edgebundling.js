'use strict';

var _          = require('underscore'),
    Q          = require('q'),
    debug      = require('debug')('graphistry:graph-viz:cl:edgebundling'),
    cljs       = require('./cl.js'),
    util       = require('./util.js'),
    webcl      = require('node-webcl'),
    Kernel     = require('./kernel.js'),
    LayoutAlgo = require('./layoutAlgo.js');


function EdgeBundling(clContext) {
    LayoutAlgo.call(this, EdgeBundling.name);

    debug('Creating GaussSeidel kernels');
    this.ebMidpoints = new Kernel('gaussSeidelMidpoints', EdgeBundling.argsMidpoints,
                                   EdgeBundling.argsType, 'edgeBundling.cl', clContext);

    this.ebMidsprings = new Kernel('gaussSeidelMidsprings', EdgeBundling.argsMidsprings,
                                   EdgeBundling.argsType, 'edgeBundling.cl', clContext);

    this.kernels = this.kernels.concat([this.ebMidpoints, this.ebMidsprings]);
}
EdgeBundling.prototype = Object.create(LayoutAlgo.prototype);
EdgeBundling.prototype.constructor = EdgeBundling;

EdgeBundling.name = 'EdgeBundling';
EdgeBundling.argsMidpoints = ['numPoints', 'numSplits', 'inputMidPoints',
                              'outputMidPoints', 'tilePointsParam', 'width',
                              'height', 'charge', 'gravity', 'randValues', 'stepNumber'];

EdgeBundling.argsMidsprings = ['numSplits', 'springs', 'workList', 'inputPoints',
                               'inputMidPoints', 'outputMidPoints', 'springMidPositions',
                               'midSpringsColorCoords', 'springStrength', 'springDistance',
                               'stepNumber'];

EdgeBundling.argsType = {
    numPoints: cljs.types.uint_t,
    numSplits: cljs.types.uint_t,
    inputMidPositions: null,
    outputMidPositions: null,
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
    inputMidPoints: null,
    outputMidPoints: null,
    springMidPositions: null,
    midSpringsColorCoords: null,
    springStrength: cljs.types.float_t,
    springDistance: cljs.types.float_t,
}


EdgeBundling.prototype.setEdges = function (simulator) {
    var localPosSize =
        Math.min(simulator.cl.maxThreads, simulator.numMidPoints)
        * simulator.elementsPerPoint
        * Float32Array.BYTES_PER_ELEMENT;

    var global = simulator.controls.global;

    this.ebMidpoints.set({
        numPoints: simulator.numMidPoints,
        numSplits: global.numSplits,
        inputMidPoints: simulator.buffers.curMidPoints.buffer,
        outputMidPoints: simulator.buffers.nextMidPoints.buffer,
        tilePointsParam: localPosSize,
        width: global.dimensions[0],
        height: global.dimensions[1],
        randValues: simulator.buffers.randValues.buffer
    });

    this.ebMidsprings.set({
        numSplits: global.numSplits,
        springs: simulator.buffers.forwardsEdges.buffer,
        workList: simulator.buffers.forwardsWorkItems.buffer,
        inputPoints: simulator.buffers.curPoints.buffer,
        inputMidPoints: simulator.buffers.nextMidPoints.buffer,
        outputMidPoints: simulator.buffers.curMidPoints.buffer,
        springMidPositions: simulator.buffers.midSpringsPos.buffer,
        midSpringsColorCoords: simulator.buffers.midSpringsColorCoord.buffer
    });
}

function midPoints(simulator, ebMidpoints, stepNumber) {
    var resources = [
        simulator.buffers.curMidPoints,
        simulator.buffers.nextMidPoints,
        simulator.buffers.midSpringsColorCoord
    ];

    ebMidpoints.set({stepNumber: stepNumber});
    simulator.tickBuffers(['curMidPoints', 'nextMidPoints']);

    debug('Running kernel gaussSeidelMidpoints')
    return ebMidpoints.exec([simulator.numMidPoints], resources);
}

function midEdges(simulator, ebMidsprings, stepNumber) {
    var resources = [
        simulator.buffers.forwardsEdges,
        simulator.buffers.forwardsWorkItems,
        simulator.buffers.curPoints,
        simulator.buffers.nextMidPoints,
        simulator.buffers.curMidPoints,
        simulator.buffers.midSpringsPos,
        simulator.buffers.midSpringsColorCoord
    ];

    ebMidsprings.set({stepNumber: stepNumber});

    simulator.tickBuffers(['curMidPoints', 'midSpringsPos', 'midSpringsColorCoord']);

    debug('Running kernel gaussSeidelMidsprings')
    return ebMidsprings.exec([simulator.numForwardsWorkItems], resources);
}

EdgeBundling.prototype.tick = function(simulator, stepNumber) {
    var that = this;
    var locks = simulator.controls.locks;
    if (locks.lockMidpoints && locks.lockMidedges) {
        debug('LOCKED, EARLY EXIT');
        return Q();
    }

    return Q().then(function () {
        if (locks.lockMidpoints) {
            simulator.tickBuffers(['nextMidPoints']);
            return simulator.buffers.curMidPoints.copyInto(simulator.buffers.nextMidPoints);
        } else {
            return midPoints(simulator, that.ebMidpoints, stepNumber);
        }
    }).then(function () { //TODO do both forwards and backwards?
        if (simulator.numEdges > 0 && !locks.lockMidedges) {
            return midEdges(simulator, that.ebMidsprings, stepNumber);
        } else {
            simulator.tickBuffers(['curMidPoints']);
            return simulator.buffers.nextMidPoints.copyInto(simulator.buffers.curMidPoints);
        }
    }).fail(function (err) {
        console.error('ERROR edgebundling tick ', (err||{}).stack)
    });
}

module.exports = EdgeBundling;

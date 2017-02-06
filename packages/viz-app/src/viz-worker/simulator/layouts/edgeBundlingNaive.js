'use strict';

import Kernel from '../kernel/kernel.js';

var _          = require('underscore'),
    Q          = require('q'),
    cljs       = require('../cl.js'),
    LayoutAlgo = require('../layoutAlgo.js'),
    log        = require('@graphistry/common').logger,
    logger     = log.createLogger('graph-viz:cl:edgebundling');


function EdgeBundling(clContext) {
    LayoutAlgo.call(this, 'EdgeBundling');

    logger.trace('Creating GaussSeidel kernels');
    this.ebMidpoints = new Kernel('gaussSeidelMidpoints', EdgeBundling.argsMidpoints,
                                   EdgeBundling.argsType, 'layouts/edgeBundlingNaive/edgeBundling.cl', clContext);

    this.ebMidsprings = new Kernel('gaussSeidelMidsprings', EdgeBundling.argsMidsprings,
                                   EdgeBundling.argsType, 'layouts/edgeBundlingNaive/edgeBundling.cl', clContext);

    this.kernels = this.kernels.concat([this.ebMidpoints, this.ebMidsprings]);
}
EdgeBundling.prototype = Object.create(LayoutAlgo.prototype);
EdgeBundling.prototype.constructor = EdgeBundling;

EdgeBundling.algoName = 'EdgeBundling';
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
    var numMidPoints = simulator.dataframe.getNumElements('midPoints');
    var localPosSize =
        Math.min(simulator.cl.maxThreads, numMidPoints)
        * simulator.elementsPerPoint
        * Float32Array.BYTES_PER_ELEMENT;

    var global = simulator.controls.global;

    this.ebMidpoints.set({
        numPoints: numMidPoints,
        numSplits: global.numSplits,
        inputMidPoints: simulator.dataframe.getBuffer('curMidPoints', 'simulator').buffer,
        outputMidPoints: simulator.dataframe.getBuffer('nextMidPoints', 'simulator').buffer,
        tilePointsParam: localPosSize,
        width: global.dimensions[0],
        height: global.dimensions[1],
        randValues: simulator.dataframe.getBuffer('randValues', 'simulator').buffer
    });

    this.ebMidsprings.set({
        numSplits: global.numSplits,
        springs: simulator.dataframe.getBuffer('forwardsEdges', 'simulator').buffer,
        workList: simulator.dataframe.getBuffer('forwardsWorkItems', 'simulator').buffer,
        inputPoints: simulator.dataframe.getBuffer('curPoints', 'simulator').buffer,
        inputMidPoints: simulator.dataframe.getBuffer('nextMidPoints', 'simulator').buffer,
        outputMidPoints: simulator.dataframe.getBuffer('curMidPoints', 'simulator').buffer,
        springMidPositions: simulator.dataframe.getBuffer('midSpringsPos', 'simulator').buffer,
        midSpringsColorCoords: simulator.dataframe.getBuffer('midSpringsColorCoord', 'simulator').buffer
    });
}

function midPoints(simulator, ebMidpoints, stepNumber) {
    var numMidPoints = simulator.dataframe.getNumElements('midPoints');
    var resources = [
        simulator.dataframe.getBuffer('curMidPoints', 'simulator'),
        simulator.dataframe.getBuffer('nextMidPoints', 'simulator'),
        simulator.dataframe.getBuffer('midSpringsColorCoord', 'simulator')
    ];

    ebMidpoints.set({stepNumber: stepNumber});
    simulator.tickBuffers(['curMidPoints', 'nextMidPoints']);

    logger.trace('Running kernel gaussSeidelMidpoints')
    return ebMidpoints.exec([numMidPoints], resources);
}

function midEdges(simulator, ebMidsprings, stepNumber) {
    var numForwardsWorkItems = simulator.dataframe.getNumElements('forwardsWorkItems');
    var resources = [
        simulator.dataframe.getBuffer('forwardsEdges', 'simulator'),
        simulator.dataframe.getBuffer('forwardsWorkItems', 'simulator'),
        simulator.dataframe.getBuffer('curPoints', 'simulator'),
        simulator.dataframe.getBuffer('nextMidPoints', 'simulator'),
        simulator.dataframe.getBuffer('curMidPoints', 'simulator'),
        simulator.dataframe.getBuffer('midSpringsPos', 'simulator'),
        simulator.dataframe.getBuffer('midSpringsColorCoord', 'simulator')
    ];

    ebMidsprings.set({stepNumber: stepNumber});

    simulator.tickBuffers(['curMidPoints', 'midSpringsPos', 'midSpringsColorCoord']);

    logger.trace('Running kernel gaussSeidelMidsprings')
    return ebMidsprings.exec([numForwardsWorkItems], resources);
}

EdgeBundling.prototype.tick = function(simulator, stepNumber) {
    var that = this;
    var locks = simulator.controls.locks;
    if (locks.lockMidpoints && locks.lockMidedges) {
        logger.trace('LOCKED, EARLY EXIT');
        return Q();
    }

    return Q().then(function () {
        if (locks.lockMidpoints) {
            simulator.tickBuffers(['nextMidPoints']);
            var curMidPoints = simulator.dataframe.getBuffer('curMidPoints', 'simulator');
            var nextMidPoints = simulator.dataframe.getBuffer('nextMidPoints', 'simulator');
            return curMidPoints.copyInto(nextMidPoints);
        } else {
            return midPoints(simulator, that.ebMidpoints, stepNumber);
        }
    }).then(function () { //TODO do both forwards and backwards?
        if (simulator.dataframe.getNumElements('edge') > 0 && !locks.lockMidedges) {
            return midEdges(simulator, that.ebMidsprings, stepNumber);
        } else {
            simulator.tickBuffers(['curMidPoints']);
            var curMidPoints = simulator.dataframe.getBuffer('curMidPoints', 'simulator');
            var nextMidPoints = simulator.dataframe.getBuffer('nextMidPoints', 'simulator');
            return nextMidPoints.copyInto(curMidPoints);
        }
    }).fail(log.makeQErrorHandler(logger, 'Failure in edgebundling tick'));
}

module.exports = EdgeBundling;

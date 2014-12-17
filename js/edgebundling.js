'use strict';

var _       = require('underscore'),
    Q       = require('q'),
    debug   = require('debug')('graphistry:graph-viz:cl:edgebundling'),
    cljs    = require('./cl.js');


if (typeof(window) == 'undefined') {
    var webcl = require('node-webcl');
} else if (typeof(webcl) == 'undefined') {
    var webcl = window.webcl;
}

var gsMidpoints = {
    numPoints: null,
    numSplits: null,
    inputMidPoints: null,
    outputMidPoints: null,
    tilePointsParam: null,
    width: null,
    height: null,
    charge: null,
    gravity: null,
    randValues: null,
    stepNumber: null
};
var gsMidpointsOrder = ['numPoints', 'numSplits', 'inputMidPoints', 'outputMidPoints', 'tilePointsParam', 
                        'width', 'height', 'charge', 'gravity', 'randValues', 'stepNumber'];
Object.seal(gsMidpoints);

var gsMidsprings = {
    numSplits: null,
    springs: null,
    workList: null,
    inputPoints: null,
    inputMidPoints: null,
    outputMidPoints: null,
    springMidPositions: null,
    midSpringsColorCoords: null,
    springStrength: null,
    springDistance: null,
    stepNumber: null
};
var gsMidspringsOrder = ['numSplits', 'springs', 'workList', 'inputPoints', 'inputMidPoints', 
                         'outputMidPoints', 'springMidPositions', 'midSpringsColorCoords', 
                         'springStrength', 'springDistance', 'stepNumber'];
Object.seal(gsMidsprings);

var argsType = {
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
Object.seal(argsType);

module.exports = {
    name: "edgeBundling",
    kernels: [
        {
            name: "gaussSeidelMidpoints",
            args: gsMidpoints,
            order: gsMidpointsOrder,
            types: argsType
        },{
            name: "gaussSeidelMidsprings",
            args: gsMidsprings,
            order: gsMidspringsOrder,
            types: argsType
        }
    ],

    setPhysics: function (cfg) {
        if ('charge' in cfg)
            gsMidpoints.charge = webcl.type ? [cfg.charge] : new Float32Array([cfg.charge]);
        if ('gravity' in cfg)
            gsMidpoints.gravity = webcl.type ? [cfg.gravity] : new Float32Array([cfg.gravity]);
        if ('edgeDistance' in cfg)
            gsMidsprings.springDistance = webcl.type ? [cfg.edgeDistance] : new Float32Array([cfg.edgeDistance]);
        if ('edgeStrength' in cfg)
            gsMidsprings.springStrength = webcl.type ? [cfg.edgeStrength] : new Float32Array([cfg.edgeStrength]);

    },

    setPoints: _.identity,

    setEdges: function (simulator) {
        var localPosSize =
            Math.min(simulator.cl.maxThreads, simulator.numMidPoints)
            * simulator.elementsPerPoint
            * Float32Array.BYTES_PER_ELEMENT;

        gsMidpoints.numPoints = webcl.type ? [simulator.numMidPoints] : new Uint32Array([simulator.numMidPoints]);
        gsMidpoints.numSplits = webcl.type ? [simulator.numSplits] : new Uint32Array([simulator.numSplits]);
        gsMidpoints.inputMidPoints = simulator.buffers.curMidPoints.buffer;
        gsMidpoints.outputMidPoints = simulator.buffers.nextMidPoints.buffer;
        gsMidpoints.tilePointsParam = webcl.type ? [localPosSize] : new Uint32Array([localPosSize]);
        gsMidpoints.width = webcl.type ? [simulator.dimensions[0]] : new Float32Array([simulator.dimensions[0]]);
        gsMidpoints.height = webcl.type ? [simulator.dimensions[1]] : new Float32Array([simulator.dimensions[1]]);
        gsMidpoints.randValues = simulator.buffers.randValues.buffer;

        gsMidsprings.numSplits = webcl.type ? [simulator.numSplits] : new Uint32Array([simulator.numSplits]);
        gsMidsprings.springs = simulator.buffers.forwardsEdges.buffer;
        gsMidsprings.workList = simulator.buffers.forwardsWorkItems.buffer;
        gsMidsprings.inputPoints = simulator.buffers.curPoints.buffer; 
        gsMidsprings.inputMidPoints = simulator.buffers.nextMidPoints.buffer;
        gsMidsprings.outputMidPoints = simulator.buffers.curMidPoints.buffer;
        gsMidsprings.springMidPositions = simulator.buffers.midSpringsPos.buffer;
        gsMidsprings.midSpringsColorCoords = simulator.buffers.midSpringsColorCoord.buffer; 
    },

    tick: function (simulator, stepNumber) {
        if (simulator.locked.lockMidpoints && simulator.locked.lockMidedges) {
            debug('LOCKED, EARLY EXIT');
            return Q();
        }

        return Q()
        .then(function () {

            if (simulator.locked.lockMidpoints) {
                simulator.tickBuffers(['nextMidPoints']);
                return simulator.buffers.curMidPoints.copyInto(simulator.buffers.nextMidPoints);
            } else {

                var resources = [
                    simulator.buffers.curMidPoints,
                    simulator.buffers.nextMidPoints,
                    simulator.buffers.midSpringsColorCoord
                ];

                gsMidpoints.stepNumber = webcl.type ? [stepNumber] : new Uint32Array([stepNumber]);
                setKernelArgs(simulator, "gaussSeidelMidpoints");
                simulator.tickBuffers(['curMidPoints', 'nextMidPoints']);

                debug("Running kernel gaussSeidelMidpoints")
                return simulator.kernels.gaussSeidelMidpoints.call(simulator.numMidPoints, resources);
            }
        })
        //TODO do both forwards and backwards?
        .then(function () {
            if (simulator.numEdges > 0 && !simulator.locked.lockMidedges) {
                var resources = [
                    simulator.buffers.forwardsEdges,
                    simulator.buffers.forwardsWorkItems,
                    simulator.buffers.curPoints,
                    simulator.buffers.nextMidPoints,
                    simulator.buffers.curMidPoints,
                    simulator.buffers.midSpringsPos,
                    simulator.buffers.midSpringsColorCoord
                ];

                gsMidsprings.stepNumber = webcl.type ? [stepNumber] : new Uint32Array([stepNumber]);

                setKernelArgs(simulator, "gaussSeidelMidsprings");
                simulator.tickBuffers(['curMidPoints', 'midSpringsPos', 'midSpringsColorCoord']);

                debug("Running kernel gaussSeidelMidsprings")
                return simulator.kernels.gaussSeidelMidsprings.call(simulator.numForwardsWorkItems, resources);
            } else {

                simulator.tickBuffers(['curMidPoints']);

                return simulator.buffers.nextMidPoints.copyInto(simulator.buffers.curMidPoints);
            }
        }).fail(function (err) {
            console.error('ERROR edgebundling tick ', (err||{}).stack)
        });

    }

};

var setKernelArgs = cljs.setKernelArgs.bind('', module.exports.kernels)

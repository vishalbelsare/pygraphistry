
var _       = require('underscore'),
    Q       = require('q'),
    debug   = require('debug')('StreamGL:edgebundling');


var cljs = require('./cl.js');


if (typeof(window) == 'undefined') {
    var webcl = require('node-webcl');
} else if (typeof(webcl) == 'undefined') {
    var webcl = window.webcl;
}

var gsMidpoints = {
    numPoints: null,
    numSplits: null,
    inputMidPositions: null,
    outputMidPositions: null,
    tilePointsParam: null,
    width: null,
    height: null,
    charge: null,
    gravity: null,
    randValues: null,
    stepNumber: null
};
var gsMidpointsOrder = ['numPoints', 'numSplits', 'inputMidPositions', 'outputMidPositions', 'tilePointsParam', 
                        'width', 'height', 'charge', 'gravity', 'randValues', 'stepNumber'];

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

var argsType = {
    xxnumPoints: cljs.types.uint_t,
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

module.exports = {
    name: "edgeBundling",
    kernels: [
        {
            name: "gaussSeidelMidpoints",
            args: gsMidpoints,
            order: gsMidpointsOrder
        },{
            name: "gaussSeidelMidsprings",
            args: gsMidsprings,
            order: gsMidspringsOrder
        }
    ],

    setPhysics: function (cfg) {

        /*if(cfg.hasOwnProperty('charge') || cfg.hasOwnProperty('gravity')) {
            var charge = cfg.hasOwnProperty('charge') ? (webcl.type ? [cfg.charge] : new Float32Array([cfg.charge])) : null;
            var charge_t = cfg.hasOwnProperty('charge') ? cljs.types.float_t : null;

            var gravity = cfg.hasOwnProperty('gravity') ? (webcl.type ? [cfg.gravity] : new Float32Array([cfg.gravity])) : null;
            var gravity_t = cfg.hasOwnProperty('gravity') ? cljs.types.float_t : null;

            simulator.kernels.gaussSeidelMidpoints.setArgs(
                [null, null, null, null, null, null, null, charge, gravity, null, null],
                [null, null, null, null, null, null, null, charge_t, gravity_t, null, null]);

        }*/
        if ('charge' in cfg)
            gsMidpoints.charge = webcl.type ? [cfg.charge] : new Float32Array([cfg.charge]);

        /*if(cfg.hasOwnProperty('edgeDistance') || cfg.hasOwnProperty('edgeStrength')) {
            var edgeDistance = cfg.hasOwnProperty('edgeDistance') ? (webcl.type ? [cfg.edgeDistance] : new Float32Array([cfg.edgeDistance])) : null;
            var edgeDistance_t = cfg.hasOwnProperty('edgeDistance') ? cljs.types.float_t : null;

            var edgeStrength = cfg.hasOwnProperty('edgeStrength') ? (webcl.type ? [cfg.edgeStrength] : new Float32Array([cfg.edgeStrength])) : null;
            var edgeStrength_t = cfg.hasOwnProperty('edgeStrength') ? cljs.types.float_t : null;

            simulator.kernels.gaussSeidelMidsprings.setArgs(
                // 0   1     2     3     4     5     6     7     8               9               10
                [null, null, null, null, null, null, null, null, edgeStrength,   edgeDistance,   null],
                [null, null, null, null, null, null, null, null, edgeStrength_t, edgeDistance_t, null]);
        }*/
        if ('edgeDistance' in cfg)
            gsMidsprings.edgeDistance = webcl.type ? [cfg.edgeDistance] : new Float32Array([cfg.edgeDistance]);
        if ('edgeStrength' in cfg)
            gsMidsprings.springStrength = webcl.type ? [cfg.edgeStrength] : new Float32Array([cfg.edgeStrength]);

    },

    setPoints: _.identity,

    setEdges: function (simulator) {

        var localPosSize =
            Math.min(simulator.cl.maxThreads, simulator.numMidPoints)
            * simulator.elementsPerPoint
            * Float32Array.BYTES_PER_ELEMENT;

        /*simulator.kernels.gaussSeidelMidpoints.setArgs(
            [
                webcl.type ? [simulator.numMidPoints] : new Uint32Array([simulator.numMidPoints]),
                webcl.type ? [simulator.numSplits] : new Uint32Array([simulator.numSplits]),
                simulator.buffers.curMidPoints.buffer,
                simulator.buffers.nextMidPoints.buffer,

                webcl.type ? [localPosSize] : new Uint32Array([localPosSize]),

                webcl.type ? [simulator.dimensions[0]] : new Float32Array([simulator.dimensions[0]]),
                webcl.type ? [simulator.dimensions[1]] : new Float32Array([simulator.dimensions[1]]),
                webcl.type ? [-0.00001] : new Float32Array([-0.00001]),
                webcl.type ? [0.2] : new Float32Array([0.2]),

                simulator.buffers.randValues.buffer,
                webcl.type ? [0] : new Uint32Array([0])],
            webcl.type ? [
                webcl.type.UINT, webcl.type.UINT, null, null,
                webcl.type.LOCAL_MEMORY_SIZE, webcl.type.FLOAT, webcl.type.FLOAT, webcl.type.FLOAT,webcl.type.FLOAT,
                null, webcl.type.UINT] : null);*/
        
        gsMidpoints.numPoints = webcl.type ? [simulator.numMidPoints] : new Uint32Array([simulator.numMidPoints]);
        gsMidpoints.numSplits = webcl.type ? [simulator.numSplits] : new Uint32Array([simulator.numSplits]);
        gsMidpoints.inputMidPoints = simulator.buffers.curMidPoints.buffer;
        gsMidpoints.outputMidPoints = simulator.buffers.nextMidPoints.buffer;
        gsMidpoints.tilePointsParam = webcl.type ? [localPosSize] : new Uint32Array([localPosSize]);
        gsMidpoints.width = webcl.type ? [simulator.dimensions[0]] : new Float32Array([simulator.dimensions[0]]);
        gsMidpoints.height = webcl.type ? [simulator.dimensions[1]] : new Float32Array([simulator.dimensions[1]]);
        gsMidpoints.randValues = simulator.buffers.randValues.buffer;

        /*simulator.kernels.gaussSeidelMidsprings.setArgs([
            webcl.type ? [simulator.numSplits] : new Uint32Array([simulator.numSplits]),        // 0:
            simulator.buffers.forwardsEdges.buffer,        // 1: only need one direction as guaranteed to be chains
            simulator.buffers.forwardsWorkItems.buffer,    // 2:
            simulator.buffers.curPoints.buffer,            // 3:
            simulator.buffers.nextMidPoints.buffer,        // 4:
            simulator.buffers.curMidPoints.buffer,         // 5:
            simulator.buffers.midSpringsPos.buffer,        // 6:
            simulator.buffers.midSpringsColorCoord.buffer, // 7:
            webcl.type ? [1.0] : new Float32Array([1.0]),  // 8:
            webcl.type ? [0.1] : new Float32Array([0.1]),  // 9:
            null
        ],
            webcl.type ? [
                webcl.type.UINT, null, null, null, null, null, null, null,
                webcl.type.FLOAT, webcl.type.FLOAT, null
            ] : null);*/

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

                /*simulator.kernels.gaussSeidelMidpoints.setArgs(
                    [null, null, null, null, null, null, null, null, null, null, webcl.type ? [stepNumber] : new Uint32Array([stepNumber])],
                    [null, null, null, null, null, null, null, null, null, null, cljs.types.uint_t]);*/

                gsMidpoints.stepNumber = webcl.type ? [stepNumber] : new Uint32Array([stepNumber]);
                setKernelArgs(simulator, "gaussSeidelMidpoints");
                simulator.tickBuffers(['curMidPoints', 'nextMidPoints']);

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

                /*simulator.kernels.gaussSeidelMidsprings.setArgs(
                    // 0   1     2     3     4     5     6     7     8     9     10
                    [null, null, null, null, null, null, null, null, null, null, webcl.type ? [stepNumber] : new Uint32Array([stepNumber])],
                    [null, null, null, null, null, null, null, null, null, null, cljs.types.uint_t]);*/

                gsSprings.stepNumber = webcl.type ? [stepNumber] : new Uint32Array([stepNumber]);
                setKernelArgs(simulator, "gaussSeidelMidsprings");

                simulator.tickBuffers(['curMidPoints', 'midSpringsPos', 'midSpringsColorCoord']);

                return simulator.kernels.gaussSeidelMidsprings.call(simulator.numForwardsWorkItems, resources);
            } else {

                simulator.tickBuffers(['curMidPoints']);

                return simulator.buffers.nextMidPoints.copyInto(simulator.buffers.curMidPoints);
            }
        })
        .then(_.identity, debug.bind('EDGE BUNDLING TICK ERROR'));

    }

};

var setKernelArgs = cljs.setKernelArgs.bind('', module.exports.kernels)

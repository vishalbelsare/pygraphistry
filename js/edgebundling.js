
var _ = require('underscore'),
    Q = require('Q');



var cljs = require('./cl.js');


if (typeof(window) == 'undefined') {
    var webcl = require('node-webcl');
} else if (typeof(webcl) == 'undefined') {
    var webcl = window.webcl;
}


module.exports = {

    kernelNames: ["gaussSeidelMidpoints", "gaussSeidelMidsprings"],

    setPhysics: function (simulator, cfg) {

        if(cfg.charge || cfg.gravity) {
            var charge = cfg.charge ? (webcl.type ? [cfg.charge] : new Float32Array([cfg.charge])) : null;
            var charge_t = cfg.charge ? cljs.types.float_t : null;

            var gravity = cfg.gravity ? (webcl.type ? [cfg.gravity] : new Float32Array([cfg.gravity])) : null;
            var gravity_t = cfg.gravity ? cljs.types.float_t : null;

            simulator.kernels.gaussSeidelMidpoints.setArgs(
                [null, null, null, null, null, null, null, charge, gravity, null, null],
                [null, null, null, null, null, null, null, charge_t, gravity_t, null, null]);

        }

        if(cfg.edgeDistance || cfg.edgeStrength) {
            var edgeDistance = cfg.edgeDistance ? (webcl.type ? [cfg.edgeDistance] : new Float32Array([cfg.edgeDistance])) : null;
            var edgeDistance_t = cfg.edgeDistance ? cljs.types.float_t : null;

            var edgeStrength = cfg.edgeStrength ? (webcl.type ? [cfg.edgeStrength] : new Float32Array([cfg.edgeStrength])) : null;
            var edgeStrength_t = cfg.edgeStrength ? cljs.types.float_t : null;

            simulator.kernels.gaussSeidelMidsprings.setArgs(
                // 0   1     2     3     4     5     6     7     8               9               10
                [null, null, null, null, null, null, null, null, edgeStrength,   edgeDistance,   null],
                [null, null, null, null, null, null, null, null, edgeStrength_t, edgeDistance_t, null]);
        }

    },

    setPoints: _.identity,

    setEdges: function (simulator) {

        var localPosSize =
            Math.min(simulator.cl.maxThreads, simulator.numMidPoints)
            * simulator.elementsPerPoint
            * Float32Array.BYTES_PER_ELEMENT;

        simulator.kernels.gaussSeidelMidpoints.setArgs(
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
                null, webcl.type.UINT] : null);

        simulator.kernels.gaussSeidelMidsprings.setArgs([
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
                webcl.type.FLOAT, webcl.type.FLOAT, /*webcl.type.UINT*/null
            ] : null);
    },

    tick: function (simulator, stepNumber) {

        return Q()
        .then(function () {
            if (simulator.locked.lockMidpoints) {
                return simulator.buffers.curMidPoints.copyInto(simulator.buffers.nextMidPoints);
            } else {

                var resources = [
                    simulator.buffers.curMidPoints,
                    simulator.buffers.nextMidPoints,
                    simulator.buffers.midSpringsColorCoord];

                simulator.kernels.gaussSeidelMidpoints.setArgs(
                    [null, null, null, null, null, null, null, null, null, null, webcl.type ? [stepNumber] : new Uint32Array([stepNumber])],
                    [null, null, null, null, null, null, null, null, null, null, cljs.types.uint_t]);

                return simulator.kernels.gaussSeidelMidpoints.call(simulator.numMidPoints, resources);
            }
        })
        .then(function () {
            if (simulator.numEdges > 0 && !simulator.locked.lockMidedges) {
                var resources = [
                    simulator.buffers.forwardsEdges,
                    simulator.buffers.forwardsWorkItems,
                    simulator.buffers.curPoints,
                    simulator.buffers.nextMidPoints,
                    simulator.buffers.curMidPoints,
                    simulator.buffers.midSpringsPos,
                    simulator.buffers.midSpringsColorCoord];

                simulator.kernels.gaussSeidelMidsprings.setArgs(
                    // 0   1     2     3     4     5     6     7     8     9     10
                    [null, null, null, null, null, null, null, null, null, null, webcl.type ? [stepNumber] : new Uint32Array([stepNumber])],
                    [null, null, null, null, null, null, null, null, null, null, cljs.types.uint_t]);

                return simulator.kernels.gaussSeidelMidsprings.call(simulator.numForwardsWorkItems, resources);
            } else {
                return simulator.buffers.nextMidPoints.copyInto(simulator.buffers.curMidPoints);
            }
        });

    }

};
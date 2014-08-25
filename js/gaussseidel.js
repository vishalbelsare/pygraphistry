

var debug = require("debug")("N-body:SimCL:gaussSeidel"),
    Q = require('Q');


var cljs = require('./cl.js');


if (typeof(window) == 'undefined') {
    var webcl = require('node-webcl');
} else if (typeof(webcl) == 'undefined') {
    var webcl = window.webcl;
}


module.exports = {

    kernelNames: ["gaussSeidelPoints", "gaussSeidelSprings"],

    setPhysics: function (simulator, cfg) {

        if(cfg.charge || cfg.gravity) {

            var charge = cfg.charge ? (webcl.type ? [cfg.charge] : new Float32Array([cfg.charge])) : null;
            var charge_t = cfg.charge ? cljs.types.float_t : null;

            var gravity = cfg.gravity ? (webcl.type ? [cfg.gravity] : new Float32Array([cfg.gravity])) : null;
            var gravity_t = cfg.gravity ? cljs.types.float_t : null;

            simulator.kernels.gaussSeidelPoints.setArgs(
                [null, null, null, null, null, null, charge, gravity, null, null],
                [null, null, null, null, null, null, charge_t, gravity_t, null, null]);
        }

        if(cfg.edgeDistance || cfg.edgeStrength) {
            var edgeDistance = cfg.edgeDistance ? (webcl.type ? [cfg.edgeDistance] : new Float32Array([cfg.edgeDistance])) : null;
            var edgeDistance_t = cfg.edgeDistance ? cljs.types.float_t : null;

            var edgeStrength = cfg.edgeStrength ? (webcl.type ? [cfg.edgeStrength] : new Float32Array([cfg.edgeStrength])) : null;
            var edgeStrength_t = cfg.edgeStrength ? cljs.types.float_t : null;

            simulator.kernels.gaussSeidelSprings.setArgs(
                [null, null, null, null, null, edgeStrength, edgeDistance, null],
                [null, null, null, null, null, edgeStrength_t, edgeDistance_t, null]);
        }

    },

    setPoints: function (simulator) {

        var localPosSize =
            Math.min(simulator.cl.maxThreads, simulator.numPoints)
            * simulator.elementsPerPoint
            * Float32Array.BYTES_PER_ELEMENT;

        debug("Setting point 0. FIXME: dyn alloc __local, not hardcode in kernel");

        simulator.kernels.gaussSeidelPoints.setArgs([
                webcl.type ? [simulator.numPoints] : new Uint32Array([simulator.numPoints]),
                simulator.buffers.curPoints.buffer,
                simulator.buffers.nextPoints.buffer,
                webcl.type ? [1] : new Uint32Array([localPosSize]),
                webcl.type ? [simulator.dimensions[0]] : new Float32Array([simulator.dimensions[0]]),
                webcl.type ? [simulator.dimensions[1]] : new Float32Array([simulator.dimensions[1]]),
                webcl.type ? [-0.00001] : new Float32Array([-0.00001]),
                webcl.type ? [0.2] : new Float32Array([0.2]),
                simulator.buffers.randValues.buffer,
                webcl.type ? [0] : new Uint32Array([0])
            ],
            webcl.type ? [
                webcl.type.UINT,
                null, null,
                webcl.type.LOCAL_MEMORY_SIZE,
                webcl.type.FLOAT,
                webcl.type.FLOAT,
                webcl.type.FLOAT,
                webcl.type.FLOAT,
                null,
                webcl.type.UINT
            ] : undefined);
    },

    setEdges: function (simulator) {

        simulator.kernels.gaussSeidelSprings.setArgs(
            [   null, //forwards/backwards picked dynamically
                null, //forwards/backwards picked dynamically
                null, //simulator.buffers.curPoints.buffer then simulator.buffers.nextPoints.buffer
                null, //simulator.buffers.nextPoints.buffer then simulator.buffers.curPoints.buffer
                simulator.buffers.springsPos.buffer,
                webcl.type ? [1.0] : new Float32Array([1.0]),
                webcl.type ? [0.1] : new Float32Array([0.1]),
                null],
            webcl.type ? [null, null, null, null, null,
                webcl.type.FLOAT, webcl.type.FLOAT]
                : null);
    },

    tick: function (simulator, stepNumber) {

        var edgeKernelSeq = function  (edges, workItems, numWorkItems, fromPoints, toPoints) {

            var resources = [edges, workItems, fromPoints, toPoints, simulator.buffers.springsPos];

            simulator.kernels.gaussSeidelSprings.setArgs(
                [edges.buffer, workItems.buffer, fromPoints.buffer, toPoints.buffer, null,
                 null, null, webcl.type ? [stepNumber] : new Uint32Array([stepNumber])],
                webcl.type ? [null, null, null, null, null,
                 null, null, cljs.types.uint_t] : null);

            return simulator.kernels.gaussSeidelSprings.call(numWorkItems, resources);
        };

        return Q()
        .then(function () {

            if (simulator.locked.lockPoints) {
                return;
            } else {

                var resources = [simulator.buffers.curPoints, simulator.buffers.nextPoints, simulator.buffers.randValues];

                simulator.kernels.gaussSeidelPoints.setArgs(
                    [null, null, null, null, null, null, null, null, null, webcl.type ? [stepNumber] : new Uint32Array([stepNumber])],
                    [null, null, null, null, null, null, null, null, null, cljs.types.uint_t]);

                return simulator.kernels.gaussSeidelPoints.call(simulator.numPoints, resources)
                    .then(function () {return simulator.buffers.nextPoints.copyInto(simulator.buffers.curPoints); });

            }
        }).then(function() {
            if (simulator.numEdges <= 0 || simulator.locked.lockEdges) {
                return simulator;
            }
            if(simulator.numEdges > 0) {
                return edgeKernelSeq(
                        simulator.buffers.forwardsEdges, simulator.buffers.forwardsWorkItems, simulator.numForwardsWorkItems,
                        simulator.buffers.curPoints, simulator.buffers.nextPoints)
                    .then(function () {
                         return edgeKernelSeq(
                            simulator.buffers.backwardsEdges, simulator.buffers.backwardsWorkItems, simulator.numBackwardsWorkItems,
                            simulator.buffers.nextPoints, simulator.buffers.curPoints); });
            }
        });

    }

}
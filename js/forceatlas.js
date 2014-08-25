
var debug = require("debug")("N-body:SimCL:forceAtlas2"),
    _ = require('underscore');


var cljs = require('./cl.js');


if (typeof(window) == 'undefined') {
    var webcl = require('node-webcl');
} else if (typeof(webcl) == 'undefined') {
    var webcl = window.webcl;
}

//corresponds to apply-forces.cl
//webcl.type ? [1] : new Uint32Array([localPosSize]),
var graphArgs =
    webcl.type ? [[1], [1], [0], [0]]
    : [new Float32Array([1]), new Float32Array([1]), new Uint32Array([0]), new Uint32Array([0])];
var graphArgs_t = webcl.type ? [cljs.types.float_t, cljs.types.float_t, cljs.types.uint_t, cljs.types.uint_t] : null;


module.exports = {

    kernelNames: ["forceAtlasPoints", "forceAtlasEdges"],

    setPhysics: function (simulator, cfg) {

        var vArr = [null, null, null, null];
        var tArr = [null, null, null, null];
        var anyAtlasArgsChanged = false;


        if (cfg.hasOwnProperty('scalingRatio')) {
            anyAtlasArgsChanged = true;
            var v = webcl.type ? [cfg.scalingRatio] : new Float32Array([cfg.scalingRatio]);
            var t = cljs.types.float_t;
            var idx = 0;
            vArr[idx] = v;
            tArr[idx] = t;
        }
        if (cfg.hasOwnProperty('gravity')) {
            anyAtlasArgsChanged = true;
            var v = webcl.type ? [cfg.gravity] : new Float32Array([cfg.gravity]);
            var t = cljs.types.float_t;
            var idx = 1;
            vArr[idx] = v;
            tArr[idx] = t;
        }
        if (cfg.hasOwnProperty('edgeInfluence')) {
            anyAtlasArgsChanged = true;
            var v = webcl.type ? [cfg.edgeInfluence] : new Uint32Array([cfg.edgeInfluence]);
            var t = cljs.types.uint_t;
            var idx = 2;
            vArr[idx] = v;
            tArr[idx] = t;
        }

        var flags = ['preventOverlap', 'strongGravity', 'dissuadeHubs'];
        var isAnyFlagToggled = flags.filter(function (flag) { return cfg.hasOwnProperty(flag); }).length;
        if (isAnyFlagToggled) {
            anyAtlasArgsChanged = true;
            var mask = 0;
            flags.forEach(function (flag, i) {
                var isOn = cfg.hasOwnProperty(flag) ? cfg[flag] : simulator.physics[flag];;
                if (isOn) {
                    mask = mask | (1 << i);
                }
            });

            var v = webcl.type ? [mask] : new Uint32Array([mask]);
            var t = cljs.types.uint_t;
            var idx = 3;
            vArr[idx] = v;
            tArr[idx] = t;
        }


        if (anyAtlasArgsChanged) {
            simulator.kernels.forceAtlasPoints.setArgs(vArr, tArr);
            simulator.kernels.forceAtlasEdges.setArgs(vArr, tArr);
        }

    },

    setPoints: _.identity,

    setEdges: function (simulator) {

        var localPosSize =
            Math.min(simulator.cl.maxThreads, simulator.numMidPoints)
            * simulator.elementsPerPoint
            * Float32Array.BYTES_PER_ELEMENT;

        //set here rather than with setPoints because need edges (for degrees)
        simulator.kernels.forceAtlasPoints.setArgs(
            graphArgs.concat([
                webcl.type ? [1] : new Uint32Array([localPosSize]),
                webcl.type ? [1] : new Uint32Array([localPosSize]),
                webcl.type ? [1] : new Uint32Array([localPosSize]),
                webcl.type ? [simulator.numPoints] : new Uint32Array([simulator.numPoints]),
                simulator.buffers.curPoints.buffer,
                webcl.type ? [simulator.dimensions[0]] : new Float32Array([simulator.dimensions[0]]),
                webcl.type ? [simulator.dimensions[1]] : new Float32Array([simulator.dimensions[1]]),
                webcl.type ? [0] : new Uint32Array([0]),
                simulator.buffers.forwardsDegrees.buffer,
                simulator.buffers.backwardsDegrees.buffer,
                simulator.buffers.nextPoints.buffer
            ]),
            webcl.type ? graphArgs_t.concat([
                webcl.type.LOCAL_MEMORY_SIZE,
                webcl.type.LOCAL_MEMORY_SIZE,
                webcl.type.LOCAL_MEMORY_SIZE,
                webcl.type.UINT,
                null,
                webcl.type.FLOAT,
                webcl.type.FLOAT,
                webcl.type.UINT,
                null,
                null,
                null
            ]) : undefined);

        simulator.kernels.forceAtlasEdges.setArgs(
            graphArgs.concat([
                null, //forwards/backwards picked dynamically
                null, //forwards/backwards picked dynamically
                null, //simulator.buffers.curPoints.buffer then simulator.buffers.nextPoints.buffer
                null,
                null,
                simulator.buffers.springsPos.buffer
            ]),
            webcl.type ? graphArgs_t.concat([
                null, null, null,
                null, null, null
            ]) : null);
    },

    tick: function (simulator, stepNumber) {

        if (simulator.physics.forceAtlas) {

            var atlasEdgesKernelSeq = function (edges, workItems, numWorkItems, fromPoints, toPoints) {

                var resources = [edges, workItems, fromPoints, toPoints];

                simulator.kernels.forceAtlasEdges.setArgs(
                    graphArgs.map(function () { return null; })
                        .concat(
                            [edges.buffer, workItems.buffer, fromPoints.buffer, webcl.type ? [stepNumber] : new Uint32Array([stepNumber]),
                            toPoints.buffer]),
                    webcl.type ? graphArgs_t.map(function () { return null; })
                        .concat([null, null, null, cljs.types.uint_t, null])
                        : undefined);

                return simulator.kernels.forceAtlasEdges.call(numWorkItems, resources);
            };

            var resources = [
                simulator.buffers.curPoints,
                simulator.buffers.forwardsDegrees,
                simulator.buffers.backwardsDegrees,
                simulator.buffers.nextPoints,
            ];

            simulator.kernels.forceAtlasPoints.setArgs(
                graphArgs.map(function () { return null; })
                    .concat([null, null, null, null, null, null, null, webcl.type ? [stepNumber] : new Uint32Array([stepNumber])]),
                webcl.type ? graphArgs_t.map(function () { return null; })
                    .concat([null, null, null, null, null, null, null, cljs.types.uint_t])
                    : undefined);

            var appliedForces = simulator.kernels.forceAtlasPoints.call(simulator.numPoints, resources);

            return appliedForces
                .then(function () {
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
                            });
                    }
                });
        }
    }
};
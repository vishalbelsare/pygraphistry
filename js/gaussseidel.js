'use strict';

var debug = require("debug")("graphistry:graph-viz:gaussseidel")
var Q = require('q');
var _ = require('underscore');
var cljs = require('./cl.js');

if (typeof(window) == 'undefined') {
    var webcl = require('node-webcl');
} else if (typeof(webcl) == 'undefined') {
    var webcl = window.webcl;
}

var gsPoints = {
    numPoints: null,
    inputPositions: null,
    outputPositions: null,
    tilePointsParam: null,
    width: null,
    height: null,
    charge: null,
    gravity: null,
    randValues: null,
    stepNumber: null
};
var gsPointsOrder = ['numPoints',  'inputPositions', 'outputPositions', 'tilePointsParam', 'width', 
                      'height', 'charge', 'gravity', 'randValues', 'stepNumber'];

var gsSprings = {
    springs: null,
    workList: null,
    inputPoints: null,
    outputPoints: null,
    springStrength: null,
    springDistance: null,
    stepNumber: null
};
var gsSpringsOrder = ['springs', 'workList', 'inputPoints', 'outputPoints', 
                      'springStrength', 'springDistance','stepNumber'];

var gsSpringsGather = {
    springs: null,
    workList: null,
    inputPoints: null,
    springPositions: null
};
var gsSpringsGatherOrder = ['springs', 'workList', 'inputPoints', 'springPositions'];

var argsType = {
    numPoints: cljs.types.uint_t,
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
    springStrength: cljs.types.float_t,
    springDistance: cljs.types.float_t,
    springPositions: null 
}

module.exports = {
    name: "gaussSeidel",
    kernels: [
        {
            name: "gaussSeidelPoints",
            args: gsPoints,
            order: gsPointsOrder,
            types: argsType
        },{
            name: "gaussSeidelSprings",
            args: gsSprings,
            order: gsSpringsOrder,
            types: argsType
        },{
            name: "gaussSeidelSpringsGather",
            args: gsSpringsGather,
            order: gsSpringsGatherOrder,
            types: argsType
        }
    ],
    
    setPhysics: function (cfg) {
        if ('charge' in cfg)
            gsPoints.charge = cfg.charge;
        if ('gravity' in cfg)
            gsPoints.gravity = cfg.gravity;
        if ('edgeDistance' in cfg)
          gsSprings.springDistance = cfg.edgeDistance;
        if ('edgeStrength' in cfg)
          gsSprings.springStrength = cfg.edgeStrength;
    },

    setPoints: function (simulator) {

        var localPosSize =
            Math.min(simulator.cl.maxThreads, simulator.numPoints)
            * simulator.elementsPerPoint
            * Float32Array.BYTES_PER_ELEMENT;

        debug("Setting point 0. FIXME: dyn alloc __local, not hardcode in kernel");

        gsPoints.numPoints = webcl.type ? [simulator.numPoints] : new Uint32Array([simulator.numPoints]);
        gsPoints.inputPositions = simulator.buffers.curPoints.buffer;
        gsPoints.outputPositions = simulator.buffers.nextPoints.buffer;
        gsPoints.tilePointsParam = webcl.type ? [1] : new Uint32Array([localPosSize]);
        gsPoints.width = webcl.type ? [simulator.dimensions[0]] : new Float32Array([simulator.dimensions[0]]);
        gsPoints.height = webcl.type ? [simulator.dimensions[1]] : new Float32Array([simulator.dimensions[1]]);
        gsPoints.randValues = simulator.buffers.randValues.buffer;
        gsPoints.stepNumber = webcl.type ? [0] : new Uint32Array([0]);
    },

    setEdges: function (simulator) {
        gsSprings.springs = null;
        gsSprings.workList = null;
        gsSprings.inputPoints = null;
        gsSprings.outputPoints = null;
        gsSprings.stepNumber = null;

        gsSpringsGather.springs = simulator.buffers.forwardsEdges.buffer; 
        gsSpringsGather.workList = simulator.buffers.forwardsWorkItems.buffer; 
        gsSpringsGather.inputPoints = simulator.buffers.curPoints.buffer; 
        gsSpringsGather.springPositions = simulator.buffers.springsPos.buffer;
    },

    tick: function (simulator, stepNumber) {

        var edgeKernelSeq = function  (edges, workItems, numWorkItems, fromPoints, toPoints) {

            var resources = [edges, workItems, fromPoints, toPoints, simulator.buffers.springsPos];

            gsSprings.springs = edges.buffer;
            gsSprings.workList = workItems.buffer;
            gsSprings.inputPoints = fromPoints.buffer;
            gsSprings.outputPoints = toPoints.buffer;
            gsSprings.stepNumber = webcl.type ? [stepNumber] : new Uint32Array([stepNumber]); 
            
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

                gsPoints.stepNumber = webcl.type ? [stepNumber] : new Uint32Array([stepNumber]);
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
                        simulator.buffers.curPoints, simulator.buffers.nextPoints)
                    .then(function () {
                         return edgeKernelSeq(
                            simulator.buffers.backwardsEdges, simulator.buffers.backwardsWorkItems, simulator.numBackwardsWorkItems,
                            simulator.buffers.nextPoints, simulator.buffers.curPoints); 
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
}
var setKernelArgs = cljs.setKernelArgs.bind('', module.exports.kernels)

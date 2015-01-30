'use strict';

var _       = require('underscore'),
    Q       = require('q'),
    debug   = require('debug')('graphistry:graph-viz:cl:edgebundling'),
    cljs    = require('./cl.js'),
    util    = require('./util.js'),
    webcl = require('node-webcl');



var gsMidpointsOrder = ['numPoints', 'numSplits', 'inputMidPoints',
                        'outputMidPoints', /*'tilePointsParam',*/ 'width',
                        'height', 'charge', 'gravity', 'randValues', 'stepNumber'];
var gsMidpoints = _.object(gsMidpointsOrder.map(function (name) { return [name, null]; }));
Object.seal(gsMidpoints);

var gsMidspringsOrder = ['numSplits', 'springs', 'workList', 'inputPoints', 'inputMidPoints',
                         'outputMidPoints', 'springMidPositions', 'midSpringsColorCoords',
                         'springStrength', 'springDistance', 'stepNumber'];
var gsMidsprings = _.object(gsMidspringsOrder.map(function (name) { return [name, null]; }));
Object.seal(gsMidsprings);

var argsType = {
    numPoints: cljs.types.uint_t,
    numSplits: cljs.types.uint_t,
    inputMidPositions: cljs.types.global_t,
    outputMidPositions: cljs.types.global_t,
    tilePointsParam: cljs.types.local_t,
    width: cljs.types.float_t,
    height: cljs.types.float_t,
    charge: cljs.types.float_t,
    gravity: cljs.types.float_t,
    randValues: cljs.types.global_t,
    stepNumber: cljs.types.uint_t,
    springs: cljs.types.global_t,
    workList: cljs.types.global_t,
    inputPoints: cljs.types.global_t,
    inputMidPoints: cljs.types.global_t,
    outputMidPoints: cljs.types.global_t,
    springMidPositions: cljs.types.global_t,
    midSpringsColorCoords: cljs.types.global_t,
    springStrength: cljs.types.float_t,
    springDistance: cljs.types.float_t,
}
Object.seal(argsType);

var kernels = [
    {
        name: 'gaussSeidelMidpoints',
        args: gsMidpoints,
        order: gsMidpointsOrder,
        types: argsType,
        file: 'edgeBundling.cl'
    },{
        name: 'gaussSeidelMidsprings',
        args: gsMidsprings,
        order: gsMidspringsOrder,
        types: argsType,
        file: 'edgeBundling.cl'
    }
]
util.saneKernels(kernels);

var setKernelArgs = cljs.setKernelArgs.bind('', kernels)


function setPhysics(cfg) {
    if ('charge' in cfg)
        gsMidpoints.charge = cfg.charge;
    if ('gravity' in cfg)
        gsMidpoints.gravity = cfg.gravity;
    if ('edgeDistance0' in cfg)
        gsMidsprings.springDistance = cfg.edgeDistance0;
    if ('edgeStrength0' in cfg)
        gsMidsprings.springStrength = cfg.edgeStrength0;
}

function setEdges(simulator) {
    var localPosSize =
        Math.min(simulator.cl.maxThreads, simulator.numMidPoints)
        * simulator.elementsPerPoint
        * Float32Array.BYTES_PER_ELEMENT;

    gsMidpoints.numPoints = simulator.numMidPoints;
    gsMidpoints.numSplits = simulator.numSplits;
    gsMidpoints.inputMidPoints = simulator.buffers.curMidPoints.buffer;
    gsMidpoints.outputMidPoints = simulator.buffers.nextMidPoints.buffer;
    //gsMidpoints.tilePointsParam = [localPosSize];
    gsMidpoints.width = simulator.dimensions[0];
    gsMidpoints.height = simulator.dimensions[1];
    gsMidpoints.randValues = simulator.buffers.randValues.buffer;

    gsMidsprings.numSplits = simulator.numSplits;
    gsMidsprings.springs = simulator.buffers.forwardsEdges.buffer;
    gsMidsprings.workList = simulator.buffers.forwardsWorkItems.buffer;
    gsMidsprings.inputPoints = simulator.buffers.curPoints.buffer;
    gsMidsprings.inputMidPoints = simulator.buffers.nextMidPoints.buffer;
    gsMidsprings.outputMidPoints = simulator.buffers.curMidPoints.buffer;
    gsMidsprings.springMidPositions = simulator.buffers.midSpringsPos.buffer;
    gsMidsprings.midSpringsColorCoords = simulator.buffers.midSpringsColorCoord.buffer;
}

function tick(simulator, stepNumber) {
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

            gsMidpoints.stepNumber = stepNumber;
            setKernelArgs(simulator, 'gaussSeidelMidpoints');
            simulator.tickBuffers(['curMidPoints', 'nextMidPoints']);

            debug('Running kernel gaussSeidelMidpoints')
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

            gsMidsprings.stepNumber = stepNumber;

            setKernelArgs(simulator, 'gaussSeidelMidsprings');
            simulator.tickBuffers(['curMidPoints', 'midSpringsPos', 'midSpringsColorCoord']);

            debug('Running kernel gaussSeidelMidsprings')
            return simulator.kernels.gaussSeidelMidsprings.call(simulator.numForwardsWorkItems, resources);
        } else {

            simulator.tickBuffers(['curMidPoints']);

            return simulator.buffers.nextMidPoints.copyInto(simulator.buffers.curMidPoints);
        }
    }).fail(function (err) {
        console.error('ERROR edgebundling tick ', (err||{}).stack)
    });

}

module.exports = {
    name: 'edgeBundling',
    kernels: kernels,
    setPhysics: setPhysics,
    setPoints: _.identity,
    setEdges: setEdges,
    tick: tick
};

'use strict';

import Kernel from '../kernel/kernel.js';

var          _ = require('underscore'),
       cljs = require('../cl.js'),
          Q = require('q'),
 LayoutAlgo = require('../layoutAlgo.js'),
    log        = require('@graphistry/common').logger,
    logger     = log.createLogger('graph-viz:cl:forceatlas2');


function ForceAtlas2Fast(clContext) {
    LayoutAlgo.call(this, 'ForceAtlas2Fast');

    logger.trace('Creating ForceAtlas2Fast kernels');
    this.faPoints = new Kernel('faPointForces', ForceAtlas2Fast.argsPoints,
                               ForceAtlas2Fast.argsType, 'layouts/forceAtlas2Naive/faPointForces.cl', clContext);
    this.faEdges = new Kernel('faEdgeForces', ForceAtlas2Fast.argsEdges,
                               ForceAtlas2Fast.argsType, 'layouts/forceAtlas2Naive/faEdgeForces.cl', clContext);

    this.faSwings = new Kernel('faSwingsTractions', ForceAtlas2Fast.argsSwings,
                               ForceAtlas2Fast.argsType, 'layouts/forceAtlas2Naive/faSwingsTractions.cl', clContext);

    this.faIntegrate = new Kernel('faIntegrateLegacy', ForceAtlas2Fast.argsIntegrate,
                               ForceAtlas2Fast.argsType, 'layouts/forceAtlas2Naive/faIntegrateLegacy.cl', clContext);

    this.faIntegrateApprox = new Kernel('faIntegrateApprox', ForceAtlas2Fast.argsIntegrateApprox,
                               ForceAtlas2Fast.argsType, 'layouts/forceAtlas2Naive/faIntegrateApprox.cl', clContext);

    this.kernels = this.kernels.concat([this.faPoints, this.faEdges, this.faSwings,
                                       this.faIntegrate, this.faIntegrateApprox]);
}
ForceAtlas2Fast.prototype = Object.create(LayoutAlgo.prototype);
ForceAtlas2Fast.prototype.constructor = ForceAtlas2Fast;

ForceAtlas2Fast.algoName = 'ForceAtlas2Fast';
ForceAtlas2Fast.argsPoints = [
    'strongGravity', 'scalingRatio', 'gravity',
    'edgeInfluence', 'tilePointsParam',
    'tilePointsParam2', 'numPoints', 'tilesPerIteration', 'inputPositions',
    'width', 'height', 'stepNumber', 'pointDegrees', 'pointForces'
];

ForceAtlas2Fast.argsEdges = [
    'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'edges',
    'workList', 'inputPoints', 'partialForces', 'stepNumber', 'outputForces'
];

ForceAtlas2Fast.argsSwings = ['prevForces', 'curForces', 'swings' , 'tractions'];

ForceAtlas2Fast.argsIntegrate = [
    'gSpeed', 'inputPositions', 'curForces', 'swings', 'outputPositions'
];

ForceAtlas2Fast.argsIntegrateApprox = [
    'numPoints', 'tau', 'inputPositions', 'pointDegrees', 'curForces', 'swings',
    'tractions', 'outputPositions'
];

ForceAtlas2Fast.argsType = {
    scalingRatio: cljs.types.float_t,
    gravity: cljs.types.float_t,
    edgeInfluence: cljs.types.uint_t,
    flags: cljs.types.uint_t,
    strongGravity: cljs.types.define,
    numPoints: cljs.types.uint_t,
    tilesPerIteration: cljs.types.uint_t,
    tilePointsParam: cljs.types.local_t,
    tilePointsParam2: cljs.types.local_t,
    inputPositions: null,
    pointForces: null,
    partialForces: null,
    outputForces: null,
    outputPositions: null,
    width: cljs.types.float_t,
    height: cljs.types.float_t,
    stepNumber: cljs.types.uint_t,
    pointDegrees: null,
    edges: null,
    workList: null,
    inputPoints: null,
    outputPoints: null,
    curForces: null,
    prevForces: null,
    swings: null,
    tractions: null,
    tau: cljs.types.float_t,
    gSpeed: cljs.types.float_t
}


ForceAtlas2Fast.prototype.setPhysics = function(cfg) {
    LayoutAlgo.prototype.setPhysics.call(this, cfg)

    var flags = this.faEdges.get('flags');
    var flagNames = ['dissuadeHubs', 'linLog'];
    _.each(cfg, function (val, flag) {
        var idx = flagNames.indexOf(flag);
        if (idx >= 0) {
            var mask = 0 | (1 << idx)
            if (val) {
                flags |= mask;
            } else {
                flags &= ~mask;
            }
        }
    });
    this.faEdges.set({flags: flags});
}


ForceAtlas2Fast.prototype.setEdges = function(simulator) {
    var numMidPoints = simulator.dataframe.getNumElements('midPoints');
    var numPoints = simulator.dataframe.getNumElements('point');
    var localPosSize =
        Math.min(simulator.cl.maxThreads, numMidPoints)
        * simulator.elementsPerPoint
        * Float32Array.BYTES_PER_ELEMENT;

    var global = simulator.controls.global;

    this.faPoints.set({
        tilePointsParam: 1,
        tilePointsParam2: 1,
        tilesPerIteration: simulator.tilesPerIteration,
        numPoints: numPoints,
        inputPositions: simulator.dataframe.getBuffer('curPoints', 'simulator').buffer,
        width: global.dimensions[0],
        height: global.dimensions[1],
        pointDegrees: simulator.dataframe.getBuffer('degrees', 'simulator').buffer,
        pointForces: simulator.dataframe.getBuffer('partialForces1', 'simulator').buffer
    });
}


function pointForces(simulator, faPoints, stepNumber) {
    var numPoints = simulator.dataframe.getNumElements('point');
    var resources = [
        simulator.dataframe.getBuffer('curPoints', 'simulator'),
        simulator.dataframe.getBuffer('forwardsDegrees', 'simulator'),
        simulator.dataframe.getBuffer('backwardsDegrees', 'simulator'),
        simulator.dataframe.getBuffer('partialForces1', 'simulator')
    ];

    faPoints.set({stepNumber: stepNumber});

    simulator.tickBuffers(['partialForces1']);

    logger.trace("Running kernel faPointForces");
    return faPoints.exec([numPoints], resources)
        .fail(log.makeQErrorHandler(logger, 'Kernel faPointForces failed'));
}


function edgeForcesOneWay(simulator, faEdges, edges, workItems, numWorkItems,
                          points, stepNumber, partialForces, outputForces) {
    faEdges.set({
        edges: edges.buffer,
        workList: workItems.buffer,
        inputPoints: points.buffer,
        stepNumber: stepNumber,
        partialForces: partialForces.buffer,
        outputForces: outputForces.buffer
    });

    var resources = [edges, workItems, points, partialForces, outputForces];

    simulator.tickBuffers(
        simulator.dataframe.getBufferKeys('simulator').filter(function (name) {
            return simulator.dataframe.getBuffer(name, 'simulator') == outputForces;
        })
    );

    logger.trace("Running kernel faEdgeForces");
    return faEdges.exec([numWorkItems], resources);
}


function edgeForces(simulator, faEdges, stepNumber) {
    var buffers = simulator.buffers;
    return edgeForcesOneWay(simulator, faEdges,
                            simulator.dataframe.getBuffer('forwardsEdges', 'simulator'), simulator.dataframe.getBuffer('forwardsWorkItems', 'simulator'),
                            simulator.dataframe.getNumElements('forwardsWorkItems'),
                            simulator.dataframe.getBuffer('curPoints', 'simulator'), stepNumber,
                            simulator.dataframe.getBuffer('partialForces1', 'simulator'), simulator.dataframe.getBuffer('partialForces2', 'simulator'))
    .then(function () {
        return edgeForcesOneWay(simulator, faEdges,
                                simulator.dataframe.getBuffer('backwardsEdges', 'simulator'), simulator.dataframe.getBuffer('backwardsWorkItems', 'simulator'),
                                simulator.dataframe.getNumElements('backwardsWorkItems'),
                                simulator.dataframe.getBuffer('curPoints', 'simulator'), stepNumber,
                                simulator.dataframe.getBuffer('partialForces2', 'simulator'), simulator.dataframe.getBuffer('curForces', 'simulator'));
    }).fail(log.makeQErrorHandler(logger, 'Kernel faPointEdges failed'));
}


function swingsTractions(simulator, faSwings) {
    var buffers = simulator.buffers;
    var numPoints = simulator.dataframe.getNumElements('point');
    faSwings.set({
        prevForces: simulator.dataframe.getBuffer('prevForces', 'simulator').buffer,
        curForces: simulator.dataframe.getBuffer('curForces', 'simulator').buffer,
        swings: simulator.dataframe.getBuffer('swings', 'simulator').buffer,
        tractions: simulator.dataframe.getBuffer('tractions', 'simulator').buffer
    });

    var resources = [
        simulator.dataframe.getBuffer('prevForces', 'simulator'),
        simulator.dataframe.getBuffer('curForces', 'simulator'),
        simulator.dataframe.getBuffer('swings', 'simulator'),
        simulator.dataframe.getBuffer('tractions', 'simulator')
    ];

    simulator.tickBuffers(['swings', 'tractions']);

    logger.trace("Running kernel faSwingsTractions");
    return faSwings.exec([numPoints], resources)
        .fail(log.makeQErrorHandler(logger, 'Kernel faSwingsTractions failed'));
}


function integrate(simulator, faIntegrate) {
    var buffers = simulator.buffers;
    var numPoints = simulator.dataframe.getNumElements('point');
    faIntegrate.set({
        gSpeed: 1.0,
        inputPositions: simulator.dataframe.getBuffer('curPoints', 'simulator').buffer,
        curForces: simulator.dataframe.getBuffer('curForces', 'simulator').buffer,
        swings: simulator.dataframe.getBuffer('swings', 'simulator').buffer,
        outputPositions: simulator.dataframe.getBuffer('nextPoints', 'simulator').buffer
    });

    var resources = [
        simulator.dataframe.getBuffer('curPoints', 'simulator'),
        simulator.dataframe.getBuffer('curForces', 'simulator'),
        simulator.dataframe.getBuffer('swings', 'simulator'),
        simulator.dataframe.getBuffer('nextPoints', 'simulator')
    ];

    simulator.tickBuffers(['nextPoints']);

    logger.trace("Running kernel faIntegrate");
    return faIntegrate.exec([numPoints], resources)
        .fail(log.makeQErrorHandler(logger, 'Kernel faIntegrate failed'));
}

function integrateApprox(simulator, faIntegrateApprox) {
    var buffers = simulator.buffers;
    var numPoints = simulator.dataframe.getNumElements('point');

    faIntegrateApprox.set({
        numPoints: numPoints,
        inputPositions: simulator.dataframe.getBuffer('curPoints', 'simulator').buffer,
        pointDegrees: simulator.dataframe.getBuffer('degrees', 'simulator').buffer,
        curForces: simulator.dataframe.getBuffer('curForces', 'simulator').buffer,
        swings: simulator.dataframe.getBuffer('swings', 'simulator').buffer,
        tractions: simulator.dataframe.getBuffer('tractions', 'simulator').buffer,
        outputPositions: simulator.dataframe.getBuffer('nextPoints', 'simulator').buffer
    });

    var resources = [
        simulator.dataframe.getBuffer('curPoints', 'simulator'),
        simulator.dataframe.getBuffer('forwardsDegrees', 'simulator'),
        simulator.dataframe.getBuffer('backwardsDegrees', 'simulator'),
        simulator.dataframe.getBuffer('curForces', 'simulator'),
        simulator.dataframe.getBuffer('swings', 'simulator'),
        simulator.dataframe.getBuffer('tractions', 'simulator'),
        simulator.dataframe.getBuffer('nextPoints', 'simulator')
    ];

    simulator.tickBuffers(['nextPoints']);

    logger.trace('Running kernel faIntegrateApprox');
    return faIntegrateApprox.exec([numPoints], resources)
        .fail(log.makeQErrorHandler(logger, 'Kernel faIntegrateApprox failed'));
}


ForceAtlas2Fast.prototype.tick = function(simulator, stepNumber) {
    var that = this;
    var tickTime = Date.now();
    return pointForces(simulator, that.faPoints, stepNumber)
    .then(function () {
        return edgeForces(simulator, that.faEdges, stepNumber);
    }).then(function () {
        return swingsTractions(simulator, that.faSwings);
    }).then(function () {
        return integrate(simulator, that.faIntegrate);
        //return integrateApprox(simulator, that.faIntegrateApprox);
    }).then(function () {
        var buffers = simulator.buffers;
        simulator.tickBuffers(['curPoints']);

        var nextPoints = simulator.dataframe.getBuffer('nextPoints', 'simulator');
        var curPoints = simulator.dataframe.getBuffer('curPoints', 'simulator');
        var curForces = simulator.dataframe.getBuffer('curForces', 'simulator');
        var prevForces = simulator.dataframe.getBuffer('prevForces', 'simulator');

        return Q.all([
            nextPoints.copyInto(curPoints),
            curForces.copyInto(prevForces)
        ]);
    }).then(function () {
        return simulator;
    });
}


module.exports = ForceAtlas2Fast;

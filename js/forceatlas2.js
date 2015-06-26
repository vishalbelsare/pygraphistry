'use strict';

var       _ = require('underscore'),
       cljs = require('./cl.js'),
          Q = require('q'),
 LayoutAlgo = require('./layoutAlgo.js'),
     Kernel = require('./kernel.js'),
    Log        = require('common/logger.js'),
    logger     = Log.createLogger('graph-viz:cl:forceatlas2');


function ForceAtlas2(clContext) {
    LayoutAlgo.call(this, ForceAtlas2.name);

    logger.debug('Creating ForceAtlas2 kernels');
    this.faPoints = new Kernel('faPointForces', ForceAtlas2.argsPoints,
                               ForceAtlas2.argsType, 'forceAtlas2/faPointForces.cl', clContext);
    this.faEdges = new Kernel('faEdgeForces', ForceAtlas2.argsEdges,
                               ForceAtlas2.argsType, 'forceAtlas2/faEdges.cl', clContext);

    this.faSwings = new Kernel('faSwingsTractions', ForceAtlas2.argsSwings,
                               ForceAtlas2.argsType, 'forceAtlas2/faSwingsTractions.cl', clContext);

    this.faIntegrate = new Kernel('faIntegrateLegacy', ForceAtlas2.argsIntegrate,
                               ForceAtlas2.argsType, 'forceAtlas2/faIntegrateLegacy.cl', clContext);

    this.faIntegrateApprox = new Kernel('faIntegrateApprox', ForceAtlas2.argsIntegrateApprox,
                               ForceAtlas2.argsType, 'forceAtlas2/faIntegrateApprox.cl', clContext);

    this.kernels = this.kernels.concat([this.faPoints, this.faEdges, this.faSwings,
                                       this.faIntegrate, this.faIntegrateApprox]);
}
ForceAtlas2.prototype = Object.create(LayoutAlgo.prototype);
ForceAtlas2.prototype.constructor = ForceAtlas2;

ForceAtlas2.name = 'ForceAtlas2';
ForceAtlas2.argsPoints = [
    'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'tilePointsParam',
    'tilePointsParam2', 'numPoints', 'tilesPerIteration', 'inputPositions',
    'width', 'height', 'stepNumber', 'pointDegrees', 'pointForces'
];

ForceAtlas2.argsEdges = [
    'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'edges',
    'workList', 'inputPoints', 'partialForces', 'stepNumber', 'numWorkItems', 'outputForces'
];

ForceAtlas2.argsSwings = ['prevForces', 'curForces', 'swings' , 'tractions'];

ForceAtlas2.argsIntegrate = [
    'gSpeed', 'inputPositions', 'curForces', 'swings', 'outputPositions'
];

ForceAtlas2.argsIntegrateApprox = [
    'numPoints', 'tau', 'inputPositions', 'pointDegrees', 'curForces', 'swings',
    'tractions', 'outputPositions'
];

ForceAtlas2.argsType = {
    scalingRatio: cljs.types.float_t,
    gravity: cljs.types.float_t,
    edgeInfluence: cljs.types.uint_t,
    flags: cljs.types.uint_t,
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
    gSpeed: cljs.types.float_t,
    numWorkItems: cljs.types.uint_t
}


ForceAtlas2.prototype.setPhysics = function(cfg) {
    LayoutAlgo.prototype.setPhysics.call(this, cfg)

    var flags = this.faEdges.get('flags');
    var flagNames = ['preventOverlap', 'strongGravity', 'dissuadeHubs', 'linLog'];
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


ForceAtlas2.prototype.setEdges = function(simulator) {
    var localPosSize =
        Math.min(simulator.cl.maxThreads, simulator.numMidPoints)
        * simulator.elementsPerPoint
        * Float32Array.BYTES_PER_ELEMENT;

    var global = simulator.controls.global;

    this.faPoints.set({
        tilePointsParam: 1,
        tilePointsParam2: 1,
        tilesPerIteration: simulator.tilesPerIteration,
        numPoints: simulator.numPoints,
        inputPositions: simulator.buffers.curPoints.buffer,
        width: global.dimensions[0],
        height: global.dimensions[1],
        pointDegrees: simulator.buffers.degrees.buffer,
        pointForces: simulator.buffers.partialForces1.buffer
    });
}


function pointForces(simulator, faPoints, stepNumber) {
    var resources = [
        simulator.buffers.curPoints,
        simulator.buffers.forwardsDegrees,
        simulator.buffers.backwardsDegrees,
        simulator.buffers.partialForces1
    ];

    faPoints.set({stepNumber: stepNumber});

    simulator.tickBuffers(['partialForces1']);

    logger.debug("Running kernel faPointForces");
    return faPoints.exec([simulator.numPoints], resources)
        .fail(Log.makeQErrorHandler(logger, 'Kernel faPointForces failed'));
}


function edgeForcesOneWay(simulator, faEdges, edges, workItems, numWorkItems,
                          points, stepNumber, partialForces, outputForces) {
    faEdges.set({
        edges: edges.buffer,
        workList: workItems.buffer,
        inputPoints: points.buffer,
        stepNumber: stepNumber,
        numWorkItems: numWorkItems,
        partialForces: partialForces.buffer,
        outputForces: outputForces.buffer
    });

    var resources = [edges, workItems, points, partialForces, outputForces];

    simulator.tickBuffers(
        _.keys(simulator.buffers).filter(function (name) {
            return simulator.buffers[name] == outputForces;
        })
    );

    logger.debug("Running kernel faEdgeForces");
    return faEdges.exec([numWorkItems], resources);
}


function edgeForces(simulator, faEdges, stepNumber) {
    var buffers = simulator.buffers;
    return edgeForcesOneWay(simulator, faEdges,
                            buffers.forwardsEdges, buffers.forwardsWorkItems,
                            simulator.numForwardsWorkItems,
                            buffers.curPoints, stepNumber,
                            buffers.partialForces1, buffers.partialForces2)
    .then(function () {
        return edgeForcesOneWay(simulator, faEdges,
                                buffers.backwardsEdges, buffers.backwardsWorkItems,
                                simulator.numBackwardsWorkItems,
                                buffers.curPoints, stepNumber,
                                buffers.partialForces2, buffers.curForces);
    }).fail(Log.makeQErrorHandler(logger, 'Kernel faPointEdges failed'));
}


function swingsTractions(simulator, faSwings) {
    var buffers = simulator.buffers;
    faSwings.set({
        prevForces: buffers.prevForces.buffer,
        curForces: buffers.curForces.buffer,
        swings: buffers.swings.buffer,
        tractions: buffers.tractions.buffer
    });

    var resources = [
        buffers.prevForces,
        buffers.curForces,
        buffers.swings,
        buffers.tractions
    ];

    simulator.tickBuffers(['swings', 'tractions']);

    logger.debug("Running kernel faSwingsTractions");
    return faSwings.exec([simulator.numPoints], resources)
        .fail(Log.makeQErrorHandler(logger, 'Kernel faSwingsTractions failed'));
}


function integrate(simulator, faIntegrate) {
    var buffers = simulator.buffers;
    faIntegrate.set({
        gSpeed: 1.0,
        inputPositions: buffers.curPoints.buffer,
        curForces: buffers.curForces.buffer,
        swings: buffers.swings.buffer,
        outputPositions: buffers.nextPoints.buffer
    });

    var resources = [
        buffers.curPoints,
        buffers.curForces,
        buffers.swings,
        buffers.nextPoints
    ];

    simulator.tickBuffers(['nextPoints']);

    logger.debug("Running kernel faIntegrate");
    return faIntegrate.exec([simulator.numPoints], resources)
        .fail(Log.makeQErrorHandler(logger, 'Kernel faIntegrate failed'));
}

function integrateApprox(simulator, faIntegrateApprox) {
    var buffers = simulator.buffers;

    faIntegrateApprox.set({
        numPoints: simulator.numPoints,
        inputPositions: buffers.curPoints.buffer,
        pointDegrees: buffers.degrees.buffer,
        curForces: buffers.curForces.buffer,
        swings: buffers.swings.buffer,
        tractions: buffers.tractions.buffer,
        outputPositions: buffers.nextPoints.buffer
    });

    var resources = [
        buffers.curPoints,
        buffers.forwardsDegrees,
        buffers.backwardsDegrees,
        buffers.curForces,
        buffers.swings,
        buffers.tractions,
        buffers.nextPoints
    ];

    simulator.tickBuffers(['nextPoints']);

    logger.debug('Running kernel faIntegrateApprox');
    return faIntegrateApprox.exec([simulator.numPoints], resources)
        .fail(Log.makeQErrorHandler(logger, 'Kernel faIntegrateApprox failed'));
}

ForceAtlas2.prototype.tick = function(simulator, stepNumber) {
    var that = this;
    var tickTime = Date.now();
    return pointForces(simulator, that.faPoints, stepNumber)
    .then(function () {
        return edgeForces(simulator, that.faEdges, stepNumber);
    }).then(function () {
        return swingsTractions(simulator, that.faSwings);
    }).then(function () {
        return integrate(simulator, that.faIntegrate);
        // return integrateApprox(simulator, that.faIntegrateApprox);
    }).then(function () {
        var buffers = simulator.buffers;
        simulator.tickBuffers(['curPoints']);
        return Q.all([
            buffers.nextPoints.copyInto(buffers.curPoints),
            buffers.curForces.copyInto(buffers.prevForces)
        ]);
    }).then(function () {
        return simulator;
    });
}


module.exports = ForceAtlas2;

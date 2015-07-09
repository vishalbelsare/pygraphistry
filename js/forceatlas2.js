'use strict';

var   debug = require("debug")("graphistry:graph-viz:cl:forceatlas2"),
          _ = require('underscore'),
       cljs = require('./cl.js'),
          Q = require('q'),
        log = require('common/log.js'),
         eh = require('common/errorHandlers.js')(log),
 LayoutAlgo = require('./layoutAlgo.js'),
     Kernel = require('./kernel.js');


function ForceAtlas2(clContext) {
    LayoutAlgo.call(this, ForceAtlas2.name);

    debug('Creating ForceAtlas2 kernels');
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

    debug("Running kernel faPointForces");
    return faPoints.exec([numPoints], resources)
        .fail(eh.makeErrorHandler('Kernel faPointForces failed'));
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
        simulator.dataframe.getBufferKeys('simulator').filter(function (name) {
            return simulator.dataframe.getBuffer(name, 'simulator') == outputForces;
        })
    );

    debug("Running kernel faEdgeForces");
    return faEdges.exec([numWorkItems], resources);
}


function edgeForces(simulator, faEdges, stepNumber) {
    var buffers = simulator.buffers;
    return edgeForcesOneWay(simulator, faEdges,
                            simulator.dataframe.getBuffer('forwardsEdges', simulator), simulator.dataframe.getBuffer('forwardsWorkItems', 'simulator'),
                            simulator.dataframe.getNumElements('forwardsWorkItems'),
                            simulator.dataframe.getBuffer('curPoints', 'simulator'), stepNumber,
                            simulator.dataframe.getBuffer('partialForces1', 'simulator'), simulator.dataframe.getBuffer('partialForces2', 'simulator'));
    .then(function () {
        return edgeForcesOneWay(simulator, faEdges,

                                simulator.dataframe.getBuffer('backwardsEdges', simulator), simulator.dataframe.getBuffer('backwardsWorkItems', 'simulator'),
                                simulator.dataframe.getNumElements('backwardsWorkItems'),
                                simulator.dataframe.getBuffer('curPoints', 'simulator'), stepNumber,
                                simulator.dataframe.getBuffer('partialForces2', 'simulator'), simulator.dataframe.getBuffer('curForces', 'simulator'));
    }).fail(eh.makeErrorHandler('Kernel faPointEdges failed'));
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

    debug("Running kernel faSwingsTractions");
    return faSwings.exec([numPoints], resources)
        .fail(eh.makeErrorHandler('Kernel faSwingsTractions failed'));
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

    debug("Running kernel faIntegrate");
    return faIntegrate.exec([numPoints], resources)
        .fail(eh.makeErrorHandler('Kernel faIntegrate failed'));
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

    debug('Running kernel faIntegrateApprox');
    return faIntegrateApprox.exec([numPoints], resources)
        .fail(eh.makeErrorHandler('Kernel faIntegrateApprox failed'));
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


module.exports = ForceAtlas2;

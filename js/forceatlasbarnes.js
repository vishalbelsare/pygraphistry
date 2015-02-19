'use strict';

var debug = require("debug")("graphistry:graph-viz:cl:forceatlas2barnes"),
    _     = require('underscore'),
    cljs  = require('./cl.js'),
    Q     = require('q'),
    util  = require('./util.js'),
    LayoutAlgo = require('./layoutAlgo.js'),
    Kernel = require('./kernel.js'),
    BarnesKernels = require('./javascript_kernels/barnes_kernels.js');

function ForceAtlas2Barnes(clContext) {
    LayoutAlgo.call(this, 'ForceAtlasBarnes');

    debug('Creating ForceAtlasBarnes kernels');
    this.barnesKernels = new BarnesKernels(clContext);

    this.toBarnesLayout = this.barnesKernels.toBarnesLayout;

    this.boundBox = this.barnesKernels.boundBox;

    this.buildTree = this.barnesKernels.buildTree;

    this.computeSums = this.barnesKernels.computeSums;

    this.sort = this.barnesKernels.sort;

    this.calculateForces = this.barnesKernels.calculateForces;

    this.move = this.barnesKernels.move;

    this.faEdges = new Kernel('faEdgeForces', ForceAtlas2Barnes.argsEdges,
                               ForceAtlas2Barnes.argsType, 'forceAtlas2.cl', clContext);

    this.faSwings = new Kernel('faSwingsTractions', ForceAtlas2Barnes.argsSwings,
                               ForceAtlas2Barnes.argsType, 'forceAtlas2.cl', clContext);

    this.faIntegrate = new Kernel('faIntegrate', ForceAtlas2Barnes.argsIntegrate,
                               ForceAtlas2Barnes.argsType, 'forceAtlas2.cl', clContext);

    this.faIntegrate2 = new Kernel('faIntegrate2', ForceAtlas2Barnes.argsIntegrate2,
                               ForceAtlas2Barnes.argsType, 'forceAtlas2.cl', clContext);

    this.faIntegrate3 = new Kernel('faIntegrate3', ForceAtlas2Barnes.argsIntegrate3,
                               ForceAtlas2Barnes.argsType, 'forceAtlas2.cl', clContext);

    this.kernels = this.kernels.concat([this.toBarnesLayout, this.boundBox, this.buildTree,
                                        this.computeSums, this.sort, this.calculateForces,
                                        this.faEdges, this.faSwings, this.faIntegrate,
                                        this.faIntegrate2, this.faIntegrate3]);
}

ForceAtlas2Barnes.prototype = Object.create(LayoutAlgo.prototype);
ForceAtlas2Barnes.prototype.constructor = ForceAtlas2Barnes;

// All BarnesHut Kernels have the same arguements
ForceAtlas2Barnes.argsEdges = [
    'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'edges',
    'workList', 'inputPoints', 'partialForces', 'stepNumber', 'numWorkItems', 'outputForces'
];

ForceAtlas2Barnes.argsSwings = ['prevForces', 'curForces', 'swings' , 'tractions'];

ForceAtlas2Barnes.argsIntegrate = [
    'gSpeed', 'inputPositions', 'curForces', 'swings', 'outputPositions'
];

ForceAtlas2Barnes.argsIntegrate2 = [
    'numPoints', 'tau', 'inputPositions', 'pointDegrees', 'curForces', 'swings',
    'tractions', 'outputPositions'
];

ForceAtlas2Barnes.argsIntegrate3 = [
    'globalSpeed', 'inputPositions', 'curForces', 'swings', 'outputPositions'
];


ForceAtlas2Barnes.argsType = {
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
    gSpeeds: null,
    tau: cljs.types.float_t,
    gSpeed: cljs.types.float_t,
    springs: null,
    numWorkItems: cljs.types.uint_t,
    globalSpeed: null
}

ForceAtlas2Barnes.prototype.setPhysics = function(cfg) {
    LayoutAlgo.prototype.setPhysics.call(this, cfg)

    var mask = 0;
    var flags = ['preventOverlap', 'strongGravity', 'dissuadeHubs', 'linLog'];
    flags.forEach(function (flag, i) {
        var isOn = cfg.hasOwnProperty(flag) ? cfg[flag] : false;
        if (isOn) {
            mask = mask | (1 << i);
        }
    });
    this.toBarnesLayout.set({flags: mask});
    this.boundBox.set({flags: mask});
    this.buildTree.set({flags: mask});
    this.computeSums.set({flags: mask});
    this.sort.set({flags: mask});
    this.calculateForces.set({flags: mask});
    this.faEdges.set({flags: mask});
}

var tempBuffers  = {
    x_cords: null, //cl.createBuffer(cl, 0, "x_cords"),
    y_cords: null,
    velx: null,
    vely: null,
    accx: null,
    accy: null,
    children: null,
    global_x_mins: null,
    global_y_mins: null,
    global_x_maxs: null,
    global_y_maxs: null,
    count: null,
    blocked: null,
    step: null,
    bottom: null,
    maxdepth: null,
};

var setupTempBuffers = function(simulator) {
    return Q.all(
        [
        simulator.cl.createBuffer(Float32Array.BYTES_PER_ELEMENT, 'global_speed')
        ])
    .spread(function (globalSpeed) {
      tempBuffers.globalSpeed = globalSpeed;
      return tempBuffers;
    })
    .catch(function(error) {
      console.log(error);
    });
};


ForceAtlas2Barnes.prototype.setEdges = function(simulator) {
    var localPosSize =
            Math.min(simulator.cl.maxThreads, simulator.numMidPoints)
            * simulator.elementsPerPoint
            * Float32Array.BYTES_PER_ELEMENT;

    var that = this;

    return setupTempBuffers(simulator).then(function (layoutBuffers) {
      that.barnesKernels.setEdges(simulator, layoutBuffers);

    });
}

function pointForces(simulator, barnesKernels, stepNumber) {
     console.log(barnesKernels);
     return barnesKernels.exec_kernels(simulator, stepNumber)
    .fail(function (err) {
        console.error('Computing pointForces failed', err, (err||{}).stack);
    });
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

    debug("Running kernel faEdgeForces");
    // 30:52, 60:50, 90:51, 120:49, 150:49, 256:48, 512:49
    return faEdges.exec([256*256], resources, [256]);
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
    }).fail(function (err) {
        console.error('Kernel faPointEdges failed', err, (err||{}).stack);
    });
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

    debug("Running kernel faSwingsTractions");
    return faSwings.exec([simulator.numPoints], resources)
        .fail(function (err) {
            console.error('Kernel faSwingsTractions failed', err, (err||{}).stack);
        });
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

    debug("Running kernel faIntegrate");
    return faIntegrate.exec([simulator.numPoints], resources)
        .fail(function (err) {
            console.error('Kernel faIntegrate failed', err, (err||{}).stack);
        });
}

function integrate3(simulator, faIntegrate3) {
    var buffers = simulator.buffers;

    faIntegrate3.set({
        globalSpeed: tempBuffers.globalSpeed.buffer,
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

    debug("Running kernel faIntegrate");
    return faIntegrate3.exec([simulator.numPoints], resources)
        .fail(function (err) {
            console.error('Kernel faIntegrate3 failed', err, (err||{}).stack);
        });
}

function integrate2(simulator, faIntegrate2) {
    var buffers = simulator.buffers;

    faIntegrate2.set({
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

    debug('Running kernel faIntegrate2');
    return faIntegrate2.exec([simulator.numPoints], resources)
        .fail(function (err) {
            console.error('Kernel faIntegrate2 failed', err, (err||{}).stack);
        });
}


ForceAtlas2Barnes.prototype.tick = function(simulator, stepNumber) {
    var that = this;
    var tickTime = Date.now();
    return pointForces(simulator, that.barnesKernels, stepNumber)
    .then(function () {
       return edgeForces(simulator, that.faEdges, stepNumber);
    }).then(function () {
        return swingsTractions(simulator, that.faSwings);
    }).then(function () {
        // return integrate(simulator, that.faIntegrate);
        // return integrate2(simulator, that.faIntegrate2);
        return integrate3(simulator, that.faIntegrate3);
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


module.exports = ForceAtlas2Barnes;

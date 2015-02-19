'use strict';

var debug = require("debug")("graphistry:graph-viz:cl:forceatlas2barnes"),
    _     = require('underscore'),
    cljs  = require('./cl.js'),
    Q     = require('q'),
    util  = require('./util.js'),
    LayoutAlgo = require('./layoutAlgo.js'),
    Kernel = require('./kernel.js');

function ForceAtlas2Barnes(clContext) {
    LayoutAlgo.call(this, 'ForceAtlasBarnes');

    debug('Creating ForceAtlasBarnes kernels');
    this.toBarnesLayout = new Kernel('to_barnes_layout', ForceAtlas2Barnes.argsToBarnesLayout,
                               ForceAtlas2Barnes.argsType, 'barnesHut.cl', clContext);

    this.boundBox = new Kernel('bound_box', ForceAtlas2Barnes.argsBarnes,
                               ForceAtlas2Barnes.argsType, 'barnesHut.cl', clContext);

    this.buildTree = new Kernel('build_tree', ForceAtlas2Barnes.argsBarnes,
                               ForceAtlas2Barnes.argsType, 'barnesHut.cl', clContext);

    this.computeSums = new Kernel('compute_sums', ForceAtlas2Barnes.argsBarnes,
                               ForceAtlas2Barnes.argsType, 'barnesHut.cl', clContext);

    this.sort = new Kernel('sort', ForceAtlas2Barnes.argsBarnes,
                               ForceAtlas2Barnes.argsType, 'barnesHut.cl', clContext);

    this.calculateForces = new Kernel('calculate_forces', ForceAtlas2Barnes.argsBarnes,
                               ForceAtlas2Barnes.argsType, 'barnesHut.cl', clContext);

    this.move = new Kernel('move_bodies', ForceAtlas2Barnes.argsBarnes,
                               ForceAtlas2Barnes.argsType, 'barnesHut.cl', clContext);

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

ForceAtlas2Barnes.argsToBarnesLayout = [
    'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'numPoints',
    'inputPositions', 'xCoords', 'yCoords', 'mass', 'blocked', 'maxDepth',
    'pointDegrees', 'stepNumber'
];

// All BarnesHut Kernels have the same arguements
ForceAtlas2Barnes.argsBarnes = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'xCoords',
                          'yCoords', 'accX', 'accY', 'children', 'mass', 'start',
                          'sort', 'globalXMin', 'globalXMax', 'globalYMin', 'globalYMax', 'swings', 'tractions',
                          'count', 'blocked', 'step', 'bottom', 'maxDepth', 'radius', 'globalSpeed', 'stepNumber',
                          'width', 'height', 'numBodies', 'numNodes', 'pointForces', 'tau'];

ForceAtlas2Barnes.argsEdges = [
    'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'edges',
    'workList', 'inputPoints', 'partialForces', 'stepNumber', 'numWorkItems', 'outputForces'
];

ForceAtlas2Barnes.argsSwings = ['prevForces', 'curForces', 'swings' , 'tractions'];

ForceAtlas2Barnes.argsSpeed = [
    'tau', 'numPoints', 'pointDegrees', 'swings', 'tractions', 'gSpeeds'
];

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
    xCoords: null,
    yCoords: null,
    accX: null,
    accY: null,
    children: null,
    mass: null,
    start: null,
    sort: null,
    globalXMin: null,
    globalXMax: null,
    globalYMin: null,
    globalYMax: null,
    count: null,
    blocked: null,
    step: null,
    bottom: null,
    maxDepth: null,
    radius: null,
    numBodies: cljs.types.uint_t,
    numNodes: cljs.types.uint_t,
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
    simulator.resetBuffers(tempBuffers);
    var blocks = 8; //TODO (paden) should be set to multiprocecessor count

    var num_nodes = simulator.numPoints * 4;
    // TODO (paden) make this into a definition
    var WARPSIZE = 16;
    if (num_nodes < 1024*blocks) num_nodes = 1024*blocks;
    while ((num_nodes & (WARPSIZE - 1)) != 0) num_nodes++;
    num_nodes--;
    var num_bodies = simulator.numPoints;
    var numNodes = num_nodes;
    var numBodies = num_bodies;
    // TODO (paden) Use actual number of workgroups. Don't hardcode
    var num_work_groups = 128;


    console.log(num_nodes + 1);
    return Q.all(
        [
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT,  'x_cords'),
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT, 'y_cords'),
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT, 'accx'),
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT, 'accy'),
        simulator.cl.createBuffer(4*(num_nodes + 1)*Int32Array.BYTES_PER_ELEMENT, 'children'),
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT, 'mass'),
        simulator.cl.createBuffer((num_nodes + 1)*Int32Array.BYTES_PER_ELEMENT, 'start'),
         //TODO (paden) Create subBuffers
        simulator.cl.createBuffer((num_nodes + 1)*Int32Array.BYTES_PER_ELEMENT, 'sort'),
        simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'global_x_mins'),
        simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'global_x_maxs'),
        simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'global_y_mins'),
        simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'global_y_maxs'),
        simulator.cl.createBuffer((num_nodes + 1)*Int32Array.BYTES_PER_ELEMENT, 'count'),
        simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'blocked'),
        simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'step'),
        simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'bottom'),
        simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'maxdepth'),
        simulator.cl.createBuffer(Float32Array.BYTES_PER_ELEMENT, 'radius'),
        simulator.cl.createBuffer(Float32Array.BYTES_PER_ELEMENT, 'global_speed')
        ])
    .spread(function (x_cords, y_cords, accx, accy, children, mass, start, sort, xmin, xmax, ymin, ymax, count,
          blocked, step, bottom, maxdepth, radius, globalSpeed) {
      tempBuffers.x_cords = x_cords;
      tempBuffers.y_cords = y_cords;
      tempBuffers.accx = accx;
      tempBuffers.accy = accy;
      tempBuffers.children = children;
      tempBuffers.mass = mass;
      tempBuffers.start = start;
      tempBuffers.sort = sort;
      tempBuffers.xmin = xmin;
      tempBuffers.xmax = xmax;
      tempBuffers.ymin = ymin;
      tempBuffers.ymax = ymax;
      tempBuffers.count = count;
      tempBuffers.blocked = blocked;
      tempBuffers.step = step;
      tempBuffers.bottom = bottom;
      tempBuffers.maxdepth = maxdepth;
      tempBuffers.radius = radius;
      tempBuffers.numNodes = numNodes;
      tempBuffers.numBodies = numBodies;
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

    return setupTempBuffers(simulator).then(function (tempBuffers) {

        that.toBarnesLayout.set({xCoords: tempBuffers.x_cords.buffer,
          yCoords:tempBuffers.y_cords.buffer, mass:tempBuffers.mass.buffer,
                            blocked:tempBuffers.blocked.buffer, maxDepth:tempBuffers.maxdepth.buffer,
                            numPoints:simulator.numPoints,
                            inputPositions: simulator.buffers.curPoints.buffer, pointDegrees: simulator.buffers.degrees.buffer});

        function setBarnesKernelArgs(kernel, buffers) {
            //console.log(buffers);
            kernel.set({xCoords:buffers.x_cords.buffer,
                        yCoords:buffers.y_cords.buffer,
                        accX:buffers.accx.buffer,
                        accY:buffers.accy.buffer,
                        children:buffers.children.buffer,
                        mass:buffers.mass.buffer,
                        start:buffers.start.buffer,
                        sort:buffers.sort.buffer,
                        globalXMin:buffers.xmin.buffer,
                        globalXMax:buffers.xmax.buffer,
                        globalYMin:buffers.ymin.buffer,
                        globalYMax:buffers.ymax.buffer,
                        swings:simulator.buffers.swings.buffer,
                        tractions:simulator.buffers.tractions.buffer,
                        count:buffers.count.buffer,
                        blocked:buffers.blocked.buffer,
                        bottom:buffers.bottom.buffer,
                        step:buffers.step.buffer,
                        maxDepth:buffers.maxdepth.buffer,
                        radius:buffers.radius.buffer,
                        globalSpeed: buffers.globalSpeed.buffer,
                        width:simulator.dimensions[0],
                        height:simulator.dimensions[1],
                        numBodies:buffers.numBodies,
                        numNodes:buffers.numNodes,
                        pointForces:simulator.buffers.partialForces1.buffer,
                        tau:1.0})
        };
        setBarnesKernelArgs(that.boundBox, tempBuffers);
        setBarnesKernelArgs(that.buildTree, tempBuffers);
        setBarnesKernelArgs(that.computeSums, tempBuffers);
        setBarnesKernelArgs(that.sort, tempBuffers);
        setBarnesKernelArgs(that.calculateForces, tempBuffers);
    });
}

function pointForces(simulator, toBarnesLayout, boundBox, buildTree,
    computeSums, sort, calculateForces, stepNumber) {
    var resources = [
        simulator.buffers.curPoints,
        simulator.buffers.forwardsDegrees,
        simulator.buffers.backwardsDegrees,
        simulator.buffers.partialForces1
    ];

    toBarnesLayout.set({stepNumber: stepNumber});
    boundBox.set({stepNumber: stepNumber});
    buildTree.set({stepNumber: stepNumber});
    computeSums.set({stepNumber: stepNumber});
    sort.set({stepNumber: stepNumber});
    calculateForces.set({stepNumber: stepNumber});


    simulator.tickBuffers(['partialForces1']);

    debug("Running Force Atlas2 with BarnesHut Kernels");

    // For all calls, we must have the # work items be a multiple of the workgroup size.
    // Above each call, I listed some benchmarks for numbers of workgroups
    // (numWorkItems = numWorkGroups * workGroupSize).
    // These are measured in ms on staging for NetflowHuge.
    // Lower these values if it's crashing on your local macbook.

    // If one is commented out, it's ideal for server but won't run locally
    // It's replaced by default with a very similar performance setting
    // that runs locally.

    return toBarnesLayout.exec([30*256], resources, [256])

    .then(function () {
      simulator.cl.queue.finish();
    })

    .then(function () {
      return boundBox.exec([30*256], resources, [256]);
    })

    // 4:49, 10:38, 20:31, 30:30, 40:31, 60:43
    .then(function () {
      return buildTree.exec([30*256], resources, [256]);
    })

    // 4:21, 10:14, 20:13, 30:13, 40:14, 60:18
    .then(function () {
      // return computeSums.exec([20*256], resources, [256]);
      return computeSums.exec([10*256], resources, [256]);
    })

    // 4:16, 10:10, 20:8, 30:8, 40:9, 60:13,
    .then(function () {
      // return sort.exec([30*256], resources, [256]);
      return sort.exec([16*256], resources, [256]);
    })

    // 60:42, 70:62, 80:57, 100:48, 120:42, 140:49, 160:45,
    // 200:45, 240:41, 280:43, 320:41, 360:41, 400:42
    .then(function () {
      // return calculateForces.exec([120*256], resources, [256]);
      return calculateForces.exec([60*256], resources, [256]);
    })

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
        tau: 1.0,
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
    return pointForces(simulator, that.toBarnesLayout, that.boundBox,
        that.buildTree, that.computeSums, that.sort, that.calculateForces, stepNumber)
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

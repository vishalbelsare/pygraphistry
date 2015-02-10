'use strict';

var debug = require("debug")("graphistry:graph-viz:cl:forceatlas2barnes"),
    _     = require('underscore'),
    cljs  = require('./cl.js'),
    gs    = require('./gaussseidel.js'),
    Q     = require('q'),
    util  = require('./util.js'),
    webcl = require('node-webcl');

var graphParams = {
    scalingRatio: null,
    gravity: null,
    edgeInfluence: null,
    flags: null
};

var toBarnesLayout = {};
_.extend(toBarnesLayout, graphParams, {
    numPoints: null,
    inputPositions: null,
    xCoords: null,
    yCoords: null,
    mass: null,
    blocked: null,
    maxDepth: null,
    pointDegrees: null,
    stepNumber: null
});
var toBarnesLayoutOrder = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'numPoints',
                          'inputPositions', 'xCoords', 'yCoords', 'mass', 'blocked', 'maxDepth',
                           'pointDegrees', 'stepNumber'];
Object.seal(toBarnesLayout);

var barnesKernels = {};
_.extend(barnesKernels, graphParams, {
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
    stepNumber: null,
    width: null,
    height: null,
    numBodies: null,
    numNodes: null
});
var barnesKernelsOrder = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'xCoords',
                          'yCoords', 'accX', 'accY', 'children', 'mass', 'start',
                          'sort', 'globalXMin', 'globalXMax', 'globalYMin', 'globalYMax',
                          'count', 'blocked', 'step', 'bottom', 'maxDepth', 'radius', 'stepNumber',
                          'width', 'height', 'numBodies', 'numNodes'];
Object.seal(barnesKernels);

var fromBarnesLayout = {};
_.extend(fromBarnesLayout, graphParams, {
    numPoints: null,
    outputPositions: null,
    xCoords: null,
    yCoords: null,
    mass: null,
    blocked: null,
    maxDepth: null,
    stepNumber: null
});
var fromBarnesLayoutOrder = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'numPoints',
                          'outputPositions', 'xCoords', 'yCoords', 'mass', 'blocked', 'maxDepth',
                           'stepNumber'];
Object.seal(fromBarnesLayout);

// var faPoints = {};
// _.extend(faPoints, graphParams, {
//     tilePointsParam: null,
//     tilePointsParam2: null,
//     numPoints: null,
//     tilesPerIteration: null,
//     inputPositions: null,
//     width: null,
//     height: null,
//     stepNumber: null,
//     pointDegrees: null,
//     pointForces: null
// });
// var faPointsOrder = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'tilePointsParam',
//                      'tilePointsParam2', 'numPoints', 'tilesPerIteration', 'inputPositions',
//                      'width', 'height', 'stepNumber', 'pointDegrees', 'pointForces'];
// Object.seal(faPoints);

var faEdges = {};
_.extend(faEdges, graphParams, {
    edges: null,
    workList: null,
    inputPoints: null,
    partialForces: null,
    stepNumber: null,
    outputForces: null
});
var faEdgesOrder = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'edges',
                    'workList', 'inputPoints', 'partialForces', 'stepNumber', 'outputForces'];
Object.seal(faEdges);

var faSwings = {
    prevForces: null,
    curForces: null,
    swings: null,
    tractions: null
}
var faSwingsOrder = ['prevForces', 'curForces', 'swings' , 'tractions'];
Object.seal(faSwings);

var faSpeed = {
    tau: null,
    numPoints: null,
    pointDegrees: null,
    swings: null,
    tractions: null,
    gSpeeds : null
}
var faSpeedOrder = ['tau', 'numPoints', 'pointDegrees', 'swings',
                    'tractions', 'gSpeeds'];
Object.seal(faSpeed);

var faIntegrate = {
    gSpeed: null,
    inputPositions: null,
    curForces: null,
    swings: null,
    outputPositions: null
}
var faIntegrateOrder = ['gSpeed', 'inputPositions', 'curForces', 'swings',
                        'outputPositions'];
Object.seal(faIntegrate);

var faIntegrate2 = {
    numPoints: null,
    tau: null,
    inputPositions: null,
    pointDegrees: null,
    curForces: null,
    swings: null,
    tractions: null,
    outputPositions: null
}
var faIntegrate2Order = ['numPoints', 'tau', 'inputPositions', 'pointDegrees',
                         'curForces', 'swings', 'tractions', 'outputPositions'];
Object.seal(faIntegrate2);

var gsSpringsGather = {}
_.extend(gsSpringsGather, gs.gsSpringsGather);

var argsType = {
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
    numNodes: cljs.types.uint_t
}
Object.seal(argsType);

// copypaste from Paden's barneshut
var numNodes = 0;
var numBodies = 0;
var setupTempBuffers = function(simulator, tempBuffers) {
    simulator.resetBuffers(tempBuffers);
    var blocks = 8; //TODO (paden) should be set to multiprocecessor count

    var num_nodes = simulator.numPoints * 2;
    // TODO (paden) make this into a definition
    var WARPSIZE = 16;
    if (num_nodes < 1024*blocks) num_nodes = 1024*blocks;
    while ((num_nodes & (WARPSIZE - 1)) != 0) num_nodes++;
    num_nodes--;
    var num_bodies = simulator.numPoints;
    numNodes = num_nodes;
    numBodies = num_bodies;
    // TODO (paden) Use actual number of workgroups. Don't hardcode
    var num_work_groups = 128;


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
        simulator.cl.createBuffer(Float32Array.BYTES_PER_ELEMENT, 'radius')
        ])
    .spread(function (x_cords, y_cords, accx, accy, children, mass, start, sort, xmin, xmax, ymin, ymax, count,
          blocked, step, bottom, maxdepth, radius) {
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
      return;
    })
    .catch(function(error) {
      console.log(error);
    });
};

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


var kernels = [
    {
    //     name: 'faPointForces',
    //     args: faPoints,
    //     order: faPointsOrder,
    //     types: argsType,
    //     file: 'forceAtlas2.cl'
    // },{
        name: 'to_barnes_layout',
        args: toBarnesLayout,
        order: toBarnesLayoutOrder,
        types: argsType,
        file: 'apply-forces.cl'
    },{
        name: 'from_barnes_layout',
        args: fromBarnesLayout,
        order: fromBarnesLayoutOrder,
        types: argsType,
        file: 'apply-forces.cl'
    },{
        name: 'bound_box',
        args: barnesKernels,
        order: barnesKernelsOrder,
        types: argsType,
        file: 'apply-forces.cl'
    },{
        name: 'build_tree',
        args: barnesKernels,
        order: barnesKernelsOrder,
        types: argsType,
        file: 'apply-forces.cl'
    },{
        name: 'compute_sums',
        args: barnesKernels,
        order: barnesKernelsOrder,
        types: argsType,
        file: 'apply-forces.cl'
    },{
        name: 'sort',
        args: barnesKernels,
        order: barnesKernelsOrder,
        types: argsType,
        file: 'apply-forces.cl'
    },{
        name: 'calculate_forces',
        args: barnesKernels,
        order: barnesKernelsOrder,
        types: argsType,
        file: 'apply-forces.cl'
    },{
        name: 'faEdgeForces',
        args: faEdges,
        order: faEdgesOrder,
        types: argsType,
        file: 'forceAtlas2.cl'
    },{
        name: 'faSwingsTractions',
        args: faSwings,
        order: faSwingsOrder,
        types: argsType,
        file: 'forceAtlas2.cl'
    },{
        name: 'faGlobalSpeed',
        args: faSpeed,
        order: faSpeedOrder,
        types: argsType,
        file: 'forceAtlas2.cl'
    },{
        name: 'faIntegrate',
        args: faIntegrate,
        order: faIntegrateOrder,
        types: argsType,
        file: 'forceAtlas2.cl'
    },{
        name: 'faIntegrate2',
        args: faIntegrate2,
        order: faIntegrate2Order,
        types: argsType,
        file: 'forceAtlas2.cl'
    },{
        name: 'gaussSeidelSpringsGather',
        args: gsSpringsGather,
        order: gs.gsSpringsGatherOrder,
        types: gs.argsType,
        file: 'gaussSeidel.cl'
    }
];
util.saneKernels(kernels);



var setKernelArgs = cljs.setKernelArgs.bind('', kernels);

function setPhysics(cfg) {
    if ('scalingRatio' in cfg) {
        var val = [cfg.scalingRatio];
        // faPoints.scalingRatio = val;
        faEdges.scalingRatio = val;
        toBarnesLayout.scalingRatio = val;
        fromBarnesLayout.scalingRatio = val;
        barnesKernels.scalingRatio = val;
    }
    if ('gravity' in cfg) {
        var val = [cfg.gravity];
        // faPoints.gravity = val;
        faEdges.gravity = val;
        toBarnesLayout.gravity = val;
        fromBarnesLayout.gravity = val;
        barnesKernels.gravity = val;
    }
    if ('edgeInfluence' in cfg) {
        var val =[cfg.edgeInfluence];
        // faPoints.edgeInfluence = val;
        faEdges.edgeInfluence = val;
        toBarnesLayout.edgeInfluence = val;
        fromBarnesLayout.edgeInfluence = val;
        barnesKernels.edgeInfluence = val;
    }

    var mask = 0;
    var flags = ['preventOverlap', 'strongGravity', 'dissuadeHubs', 'linLog'];
    flags.forEach(function (flag, i) {
        var isOn = cfg.hasOwnProperty(flag) ? cfg[flag] : false;
        if (isOn) {
            mask = mask | (1 << i);
        }
    });
    var val = [mask];
    // faPoints.flags = val;
    faEdges.flags = val;
    toBarnesLayout.flags = val;
    fromBarnesLayout.flags = val;
    barnesKernels.flags = val;
}


function setPoints() {}


function setEdges(simulator) {
    var localPosSize =
        Math.min(simulator.cl.maxThreads, simulator.numMidPoints)
        * simulator.elementsPerPoint
        * Float32Array.BYTES_PER_ELEMENT;

    // faPoints.tilePointsParam =[1];
    // faPoints.tilePointsParam2 = [1];
    // faPoints.tilesPerIteration = [simulator.tilesPerIteration];
    // faPoints.numPoints = [simulator.numPoints];
    // faPoints.inputPositions = simulator.buffers.curPoints.buffer;
    // faPoints.width = [simulator.dimensions[0]];
    // faPoints.height = [simulator.dimensions[1]];
    // faPoints.pointDegrees = simulator.buffers.degrees.buffer;
    // faPoints.pointForces = simulator.buffers.partialForces1.buffer;

    gsSpringsGather.springs = simulator.buffers.forwardsEdges.buffer;
    gsSpringsGather.workList = simulator.buffers.forwardsWorkItems.buffer;
    gsSpringsGather.inputPoints = simulator.buffers.curPoints.buffer;
    gsSpringsGather.springPositions = simulator.buffers.springsPos.buffer;

    return setupTempBuffers(simulator, tempBuffers).then(function () {
        barnesKernels.xCoords = tempBuffers.x_cords.buffer;
        barnesKernels.yCoords = tempBuffers.y_cords.buffer;
        barnesKernels.accX = tempBuffers.accx.buffer;
        barnesKernels.accY = tempBuffers.accy.buffer;
        barnesKernels.children = tempBuffers.children.buffer;
        barnesKernels.mass = tempBuffers.mass.buffer;
        barnesKernels.start = tempBuffers.start.buffer;
        barnesKernels.sort = tempBuffers.sort.buffer;
        barnesKernels.globalXMin = tempBuffers.xmin.buffer;
        barnesKernels.globalXMax = tempBuffers.xmax.buffer;
        barnesKernels.globalYMin = tempBuffers.ymin.buffer;
        barnesKernels.globalYMax = tempBuffers.ymax.buffer;
        barnesKernels.count = tempBuffers.count.buffer;
        barnesKernels.blocked = tempBuffers.blocked.buffer;
        barnesKernels.bottom = tempBuffers.bottom.buffer;
        barnesKernels.step = tempBuffers.step.buffer;
        barnesKernels.maxDepth = tempBuffers.maxdepth.buffer;
        barnesKernels.radius = tempBuffers.radius.buffer;
        barnesKernels.width = webcl.type ? [simulator.dimensions[0]] : new Float32Array([simulator.dimensions[0]]);
        barnesKernels.height = webcl.type ? [simulator.dimensions[1]] : new Float32Array([simulator.dimensions[1]]);
        barnesKernels.numBodies = webcl.type ? [numBodies] : new Uint32Array([numBodies]);
        barnesKernels.numNodes = webcl.type ? [numNodes] : new Uint32Array([numNodes]);

        toBarnesLayout.xCoords = tempBuffers.x_cords.buffer;
        toBarnesLayout.yCoords = tempBuffers.y_cords.buffer;
        toBarnesLayout.mass = tempBuffers.mass.buffer;
        toBarnesLayout.blocked = tempBuffers.blocked.buffer;
        toBarnesLayout.maxDepth = tempBuffers.maxdepth.buffer;
        toBarnesLayout.numPoints = webcl.type ? [simulator.numPoints] : new Uint32Array([simulator.numPoints]);
        toBarnesLayout.inputPositions = simulator.buffers.curPoints.buffer;
        toBarnesLayout.pointDegrees = simulator.buffers.degrees.buffer;


        fromBarnesLayout.xCoords = tempBuffers.x_cords.buffer;
        fromBarnesLayout.yCoords = tempBuffers.y_cords.buffer;
        fromBarnesLayout.mass = tempBuffers.mass.buffer;
        fromBarnesLayout.blocked = tempBuffers.blocked.buffer;
        fromBarnesLayout.maxDepth = tempBuffers.maxdepth.buffer;
        fromBarnesLayout.numPoints = webcl.type ? [simulator.numPoints] : new Uint32Array([simulator.numPoints]);
        fromBarnesLayout.outputPositions = simulator.buffers.nextPoints.buffer;
    });
}

// function pointForces(simulator, stepNumber) {
//     var resources = [
//         simulator.buffers.curPoints,
//         simulator.buffers.forwardsDegrees,
//         simulator.buffers.backwardsDegrees,
//         simulator.buffers.partialForces1
//     ];

//     faPoints.stepNumber = [stepNumber];
//     setKernelArgs(simulator, 'faPointForces');

//     simulator.tickBuffers(['partialForces1']);

//     debug("Running kernel faPointForces");
//     return simulator.kernels.faPointForces.call(simulator.numPoints, resources)
//         .fail(function (err) {
//             console.error('Kernel faPointForces failed', err, (err||{}).stack);
//         });
// }



function edgeForcesOneWay(simulator, edges, workItems, numWorkItems, points,
                          stepNumber, partialForces, outputForces) {
    faEdges.edges = edges.buffer;
    faEdges.workList = workItems.buffer;
    faEdges.inputPoints = points.buffer;
    faEdges.stepNumber = [stepNumber];
    faEdges.partialForces = partialForces.buffer;
    faEdges.outputForces = outputForces.buffer;

    setKernelArgs(simulator, 'faEdgeForces');

    var resources = [edges, workItems, points, partialForces, outputForces];

    simulator.tickBuffers(
        _.keys(simulator.buffers).filter(function (name) {
            return simulator.buffers[name] == outputForces;
        })
    );

    debug("Running kernel faEdgeForces");
    return simulator.kernels.faEdgeForces.call(numWorkItems, resources);
}

function edgeForces(simulator, stepNumber) {
    var buffers = simulator.buffers;
    return edgeForcesOneWay(simulator, buffers.forwardsEdges, buffers.forwardsWorkItems,
                            simulator.numForwardsWorkItems, buffers.curPoints,
                            stepNumber,
                            buffers.partialForces1, buffers.partialForces2)
    .then(function () {
        return edgeForcesOneWay(simulator, buffers.backwardsEdges,
                                buffers.backwardsWorkItems,
                                simulator.numBackwardsWorkItems,
                                buffers.curPoints, stepNumber,
                                buffers.partialForces2, buffers.curForces);
    }).fail(function (err) {
        console.error('Kernel faPointEdges failed', err, (err||{}).stack);
    });
}

function swingsTractions(simulator) {
    var buffers = simulator.buffers;
    faSwings.prevForces = buffers.prevForces.buffer;
    faSwings.curForces = buffers.curForces.buffer;
    faSwings.swings = buffers.swings.buffer;
    faSwings.tractions = buffers.tractions.buffer;

    var resources = [
        buffers.prevForces,
        buffers.curForces,
        buffers.swings,
        buffers.tractions
    ];

    setKernelArgs(simulator, 'faSwingsTractions');

    simulator.tickBuffers(['swings', 'tractions']);

    debug("Running kernel faSwingsTractions");
    return simulator.kernels.faSwingsTractions.call(simulator.numPoints, resources)
        .fail(function (err) {
            console.error('Kernel faSwingsTractions failed', err, (err||{}).stack);
        });
}

function integrate(simulator) {
    var buffers = simulator.buffers;
    faIntegrate.gSpeed = [1.0];
    faIntegrate.inputPositions = buffers.curPoints.buffer;
    faIntegrate.curForces = buffers.curForces.buffer;
    faIntegrate.swings = buffers.swings.buffer;
    faIntegrate.outputPositions = buffers.nextPoints.buffer;

    var resources = [
        buffers.curPoints,
        buffers.curForces,
        buffers.swings,
        buffers.nextPoints
    ];

    setKernelArgs(simulator, 'faIntegrate');

    simulator.tickBuffers(['nextPoints']);

    debug("Running kernel faIntegrate");
    return simulator.kernels.faIntegrate.call(simulator.numPoints, resources)
        .fail(function (err) {
            console.error('Kernel faIntegrate failed', err, (err||{}).stack);
        });
}

function integrate2(simulator) {
    var buffers = simulator.buffers;
    faIntegrate2.numPoints = [simulator.numPoints];
    faIntegrate2.tau = [1.0];
    faIntegrate2.inputPositions = buffers.curPoints.buffer;
    faIntegrate2.pointDegrees = buffers.degrees.buffer;
    faIntegrate2.curForces = buffers.curForces.buffer;
    faIntegrate2.swings = buffers.swings.buffer;
    faIntegrate2.tractions = buffers.tractions.buffer;
    faIntegrate2.outputPositions = buffers.nextPoints.buffer;

    var resources = [
        buffers.curPoints,
        buffers.forwardsDegrees,
        buffers.backwardsDegrees,
        buffers.curForces,
        buffers.swings,
        buffers.tractions,
        buffers.nextPoints
    ];

    setKernelArgs(simulator, 'faIntegrate2');

    simulator.tickBuffers(['nextPoints']);

    debug("Running kernel faIntegrate2");
    return simulator.kernels.faIntegrate2.call(simulator.numPoints, resources)
        .fail(function (err) {
            console.error('Kernel faIntegrate2 failed', err, (err||{}).stack);
        });
}

function gatherEdges(simulator) {
    var buffers = simulator.buffers;
    var resources = [
        buffers.forwardsEdges,
        buffers.forwardsWorkItems,
        buffers.curPoints,
        buffers.springsPos
    ];

    simulator.tickBuffers(['springsPos']);

    setKernelArgs(simulator, 'gaussSeidelSpringsGather');

    debug("Running gaussSeidelSpringsGather (forceatlas2) kernel");
    return simulator.kernels.gaussSeidelSpringsGather.call(simulator.numForwardsWorkItems, resources);
}

function tick(simulator, stepNumber) {
    var tickTime = Date.now();
    simulator.tickBuffers(['partialForces1']);
    var barnesResources = [simulator.buffers.curPoints, simulator.buffers.forwardsDegrees,
            simulator.buffers.backwardsDegrees];
    // var barnesResources = [simulator.buffers.curPoints];

    toBarnesLayout.stepNumber = webcl.type ? [stepNumber] : new Uint32Array([stepNumber]);
    fromBarnesLayout.stepNumber = webcl.type ? [stepNumber] : new Uint32Array([stepNumber]);
    barnesKernels.stepNumber = webcl.type ? [stepNumber] : new Uint32Array([stepNumber]);

    setKernelArgs(simulator, "to_barnes_layout");
    setKernelArgs(simulator, "bound_box");
    setKernelArgs(simulator, "from_barnes_layout");
    setKernelArgs(simulator, "build_tree");
    setKernelArgs(simulator, "compute_sums");
    setKernelArgs(simulator, "sort");
    setKernelArgs(simulator, "calculate_forces");

    console.log("Starting Barneshut");
    var layoutKernelSeq = simulator.kernels.to_barnes_layout.call(256, barnesResources);
    // return pointForces(simulator, stepNumber)

    return layoutKernelSeq
    .then(function() {
        barnesResources = [];
        return simulator.kernels.bound_box.call(256*10, barnesResources, 256);
    })
    .then(function(){
        return simulator.kernels.build_tree.call(4*256, barnesResources, 256);
    })
    .then(function(){
        return simulator.kernels.compute_sums.call(4*256, barnesResources, 256);
    })
    .then(function(){
        return simulator.kernels.sort.call(4*256, barnesResources, 256);
    })
    .then(function(){
        return simulator.kernels.calculate_forces.call(400*256, barnesResources, 256);
    })
    .then(function(){
        console.log("Finishing Barneshut");
        return simulator.cl.queue.finish();
    })

    .then(function () {
        return edgeForces(simulator, stepNumber);
    }).then(function () {
        return swingsTractions(simulator);
    }).then(function () {
        return integrate(simulator);
    }).then(function () {
        var buffers = simulator.buffers;
        simulator.tickBuffers(['curPoints']);
        return Q.all([
            buffers.nextPoints.copyInto(buffers.curPoints),
            buffers.curForces.copyInto(buffers.prevForces)
        ]);
    }).then(function () {
        return gatherEdges(simulator);
    }).then(function () {

    });
}


module.exports = {
    name: 'forceAtlas2',
    kernels: kernels,
    setPhysics: setPhysics,
    setPoints: setPoints,
    setEdges: setEdges,
    tick: tick
};


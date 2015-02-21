'use strict';

var debug = require("debug")("graphistry:graph-viz:cl:forceatlas2barnes"),
    _     = require('underscore'),
    cljs  = require('./cl.js'),
    Q     = require('q'),
    util  = require('./util.js'),
    LayoutAlgo = require('./layoutAlgo.js'),
    Kernel = require('./kernel.js'),
    BarnesKernelSeq = require('./javascript_kernels/barnesKernelSeq.js'),
    EdgeKernelSeq = require('./javascript_kernels/edgeKernelSeq.js'),
    faSwingsKernel = require('./javascript_kernels/faSwingsKernel.js'),
    integrate1Kernel = require('./javascript_kernels/integrate1Kernel.js'),
    integrate2Kernel = require('./javascript_kernels/integrate2Kernel.js'),
    integrate3Kernel = require('./javascript_kernels/integrate3Kernel.js');

function ForceAtlas2Barnes(clContext) {
    LayoutAlgo.call(this, 'ForceAtlasBarnes');

    debug('Creating ForceAtlasBarnes kernels');
    this.barnesKernelSeq = new BarnesKernelSeq(clContext);

    this.edgeKernelSeq = new EdgeKernelSeq(clContext);

    this.faSwingsKernel = new faSwingsKernel(clContext);

    this.integrate1Kernel = new integrate1Kernel(clContext);

    this.integrate2Kernel = new integrate2Kernel(clContext);

    this.integrate3Kernel = new integrate3Kernel(clContext);

    this.segReduce = new Kernel("segReduce", ForceAtlas2Barnes.argsSegReduce,
                                ForceAtlas2Barnes.argsType, 'segReduce.cl', clContext);


    this.kernels = this.kernels.concat([this.barnesKernelSeq.toBarnesLayout, this.barnesKernelSeq.boundBox, 
                                        this.barnesKernelSeq.buildTree, this.barnesKernelSeq.computeSums, 
                                        this.barnesKernelSeq.sort, this.barnesKernelSeq.calculateForces,
                                        this.edgeKernelSeq.faEdges, this.segReduce, this.faSwingsKernel.faSwings, 
                                        this.integrate1Kernel.faIntegrate, this.integrate2Kernel.faIntegrate2,
                                        this.integrate3Kernel.faIntegrate3]);
}

ForceAtlas2Barnes.prototype = Object.create(LayoutAlgo.prototype);
ForceAtlas2Barnes.prototype.constructor = ForceAtlas2Barnes;

ForceAtlas2Barnes.argsToBarnesLayout = [
    'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'numPoints',
    'inputPositions', 'xCoords', 'yCoords', 'mass', 'blocked', 'maxDepth',
    'pointDegrees', 'stepNumber'
];

ForceAtlas2Barnes.argsSegReduce = [
    'scalingRatio', 'gravity', 'edgeInfluence', 'flags',
    'numInput', 'input', 'edgeStartEndIdxs', 'segStart', 'workList',  'numOutput', 'carryOut_global', 'output', 'partialForces'
];

// All BarnesHut Kernels have the same arguements
ForceAtlas2Barnes.argsBarnes = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'xCoords',
                          'yCoords', 'accX', 'accY', 'children', 'mass', 'start',
                          'sort', 'globalXMin', 'globalXMax', 'globalYMin', 'globalYMax', 'swings', 'tractions',
                          'count', 'blocked', 'step', 'bottom', 'maxDepth', 'radius', 'globalSpeed', 'stepNumber',
                          'width', 'height', 'numBodies', 'numNodes', 'pointForces', 'tau'];

//ForceAtlas2Barnes.argsEdges = [
    //'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'edges',
    //'workList', 'inputPoints', 'partialForces', 'stepNumber', 'numWorkItems', 'outputForces'
//];

ForceAtlas2Barnes.argsEdgesMap = [
    'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'edges', 'numEdges',
    'workList', 'inputPoints', 'stepNumber', 'numWorkItems', 'outputForcesMap'
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
    globalSpeed: null,
    outputForcesMap: null,
    numInput: cljs.types.uint_t,
    numEdges: cljs.types.uint_t,
    numOutput: cljs.types.uint_t,
    input: null,
    output: null,
    segStart: null,
    carryOut_global: null,
    edgeStartEndIdxs: null,
     
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

    this.barnesKernelSeq.setPhysics(cfg, mask);
    this.edgeKernelSeq.setPhysics(cfg, mask);
}

// Contains any temporary buffers needed for layout
var tempLayoutBuffers  = {
  globalSpeed: null
};

// Create temporary buffers needed for layout
var setupTempLayoutBuffers = function(simulator) {
    return Q.all(
        [
        simulator.cl.createBuffer(Float32Array.BYTES_PER_ELEMENT, 'global_speed')
        ])
    .spread(function (globalSpeed) {
      tempLayoutBuffers.globalSpeed = globalSpeed;
      return tempLayoutBuffers;
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

    return setupTempLayoutBuffers(simulator).then(function (layoutBuffers) {
      that.barnesKernelSeq.setEdges(simulator, layoutBuffers);

    });
}

function pointForces(simulator, barnesKernelSeq, stepNumber) {
     return barnesKernelSeq.execKernels(simulator, stepNumber)
    .fail(function (err) {
        console.error('Computing pointForces failed', err, (err||{}).stack);
    });
}

function edgeForcesOneWay(simulator, edgeKernelSeq, edges, workItems, numWorkItems,
                          points, stepNumber, partialForces, outputForces) {

     return edgeKernelSeq.execKernels(simulator, edges, workItems, numWorkItems, points, stepNumber,
                               partialForces, outputForces);

}

function edgeForces(simulator, edgeKernelSeq, stepNumber) {
    var buffers = simulator.buffers;
    return edgeForcesOneWay(simulator, edgeKernelSeq,
                            buffers.forwardsEdges, buffers.forwardsWorkItems,
                            simulator.numForwardsWorkItems,
                            buffers.curPoints, stepNumber,
                            buffers.partialForces1, buffers.partialForces2)
    .then(function () {
        return edgeForcesOneWay(simulator, edgeKernelSeq,
                                buffers.backwardsEdges, buffers.backwardsWorkItems,
                                simulator.numBackwardsWorkItems,
                                buffers.curPoints, stepNumber,
                                buffers.partialForces2, buffers.curForces);
    }).fail(function (err) {
        console.error('Kernel faPointEdges failed', err, (err||{}).stack);
    });
}



ForceAtlas2Barnes.prototype.tick = function(simulator, stepNumber) {
    var that = this;
    var tickTime = Date.now();
    return that.barnesKernelSeq.execKernels(simulator, stepNumber)
    .then(function () {
       return edgeForces(simulator, that.edgeKernelSeq, stepNumber);
    }).then(function () {
        return that.faSwingsKernel.execKernels(simulator);
    }).then(function () {
        // return integrate(simulator, that.faIntegrate);
        // return integrate2(simulator, that.faIntegrate2);
        return that.integrate3Kernel.execKernels(simulator, tempLayoutBuffers);
        //return integrate3(simulator, that.faIntegrate3);
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

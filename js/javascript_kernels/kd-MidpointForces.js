var Kernel = require('../kernel.js'),
    Q = require('q'),
    debug = require("debug")("graphistry:graph-viz:cl:kd-MidpointForces"),
    _     = require('underscore'),
      log = require('common/log.js'),
       eh = require('common/errorHandlers.js')(log),
    cljs  = require('../cl.js');

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
    inputMidPositions: null,
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
    charge: cljs.types.float_t,
    gSpeed: cljs.types.float_t,
    springs: null,
    xCoords: null,
    yCoords: null,
    edgeDirectionX: null,
    edgeDirectionY: null,
    edgeLengths: null,
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
    globalEdgeMin: null,
    globalEdgeMax: null,
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
    nextMidPoints: null,
    midpoint_stride: cljs.types.uint_t,
    midpoints_per_edge: cljs.types.uint_t,
    WARPSIZE: cljs.types.define,
    THREADS_BOUND: cljs.types.define,
    THREADS_FORCES: cljs.types.define,
    THREADS_SUMS: cljs.types.define
}

var tempBuffers  = {
    partialForces: null,
    x_cords: null,
    y_cords: null,
    edgeDirectionX: null,
    edgeDirectionY: null,
    edgeLengths: null,
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

var setupTempBuffers = function(simulator, warpsize, numPoints) {
    simulator.resetBuffers(tempBuffers);
    var blocks = 8; //TODO (paden) should be set to multiprocecessor count

    var num_nodes = numPoints * 5;
    if (num_nodes < 1024*blocks) num_nodes = 1024*blocks;
    while ((num_nodes & (warpsize - 1)) != 0) num_nodes++;
    num_nodes--;
    var num_bodies = numPoints;
    var numNodes = num_nodes;
    var numBodies = num_bodies;
    // Set this to the number of workgroups in boundBox kernel
    var num_work_groups = 30;
    var numDimensions = 2;


    return Q.all(
        [
            simulator.cl.createBuffer(2*num_bodies*Float32Array.BYTES_PER_ELEMENT,  'partialForces'),
            simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT,  'x_cords'),
            simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT, 'y_cords'),
            simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT, 'edge_lengths'),
            simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT,  'edgeDirectionX'),
            simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT, 'edgeDirectionY'),
            simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT, 'edgeLegnth'),
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
            simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'global_edge_mins'),
            simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'global_edge_maxs'),
            simulator.cl.createBuffer((num_nodes + 1)*Int32Array.BYTES_PER_ELEMENT, 'count'),
            simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'blocked'),
            simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'step'),
            simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'bottom'),
            simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'maxdepth'),
            simulator.cl.createBuffer(numDimensions * Float32Array.BYTES_PER_ELEMENT, 'radius'),
            simulator.cl.createBuffer(Float32Array.BYTES_PER_ELEMENT, 'global_speed')
        ])
        .spread(function (partialForces, x_cords, y_cords, edgeLengths, edgeDirectionX, edgeDirectionY,
                          accx, accy, children, mass, start, sort, xmin, xmax, ymin, ymax,
                          edgeMin, edgeMax, count, blocked, step, bottom, maxdepth, radius) {
                              tempBuffers.partialForces = partialForces;
                              tempBuffers.x_cords = x_cords;
                              tempBuffers.y_cords = y_cords;
                              tempBuffers.edgeLengths = edgeLengths;
                              tempBuffers.edgeDirectionX = edgeDirectionX;
                              tempBuffers.edgeDirectionY = edgeDirectionY;
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
                              tempBuffers.edgeMin = edgeMin;
                              tempBuffers.edgeMax = edgeMax;
                              tempBuffers.count = count;
                              tempBuffers.blocked = blocked;
                              tempBuffers.step = step;
                              tempBuffers.bottom = bottom;
                              tempBuffers.maxdepth = maxdepth;
                              tempBuffers.radius = radius;
                              tempBuffers.numNodes = numNodes;
                              tempBuffers.numBodies = numBodies;
                              return tempBuffers;
                          })
                          .fail(eh.makeErrorHandler("Setting temporary buffers for barnesHutKernelSequence failed"));
};

var getBufferBindings = function (layoutBuffers, tempBuffers, simulator, warpsize, workItems) {
    bufferBindings = {
        xCoords: tempBuffers.x_cords,
        yCoords:tempBuffers.y_cords,
        accX:tempBuffers.accx,
        accY:tempBuffers.accy,
        edgeDirectionX: tempBuffers.edgeDirectionX,
        edgeDirectionY: tempBuffers.edgeDirectionY,
        edgeLengths: tempBuffers.edgeLengths,
        springs: simulator.buffers.forwardsEdges,
        mass:tempBuffers.mass,
        blocked:tempBuffers.blocked,
        maxDepth:tempBuffers.maxdepth,
        numPoints:simulator.numEdges,
        inputMidPositions: simulator.buffers.curMidPoints,
        inputPositions: simulator.buffers.curPoints,
        pointDegrees: simulator.buffers.degrees,
        WARPSIZE: warpsize,
        children:tempBuffers.children,
        mass:tempBuffers.mass,
        start:tempBuffers.start,
        sort:tempBuffers.sort,
        globalXMin:tempBuffers.xmin,
        globalXMax:tempBuffers.xmax,
        globalYMin:tempBuffers.ymin,
        globalYMax:tempBuffers.ymax,
        globalEdgeMin:tempBuffers.edgeMin,
        globalEdgeMax:tempBuffers.edgeMax,
        swings:layoutBuffers.swings,
        tractions:layoutBuffers.tractions,
        count:tempBuffers.count,
        blocked:tempBuffers.blocked,
        bottom:tempBuffers.bottom,
        step:tempBuffers.step,
        maxDepth:tempBuffers.maxdepth,
        radius:tempBuffers.radius,
        globalSpeed: layoutBuffers.globalSpeed,
        width:simulator.controls.global.dimensions[0],
        height:simulator.controls.global.dimensions[1],
        numBodies:tempBuffers.numBodies,
        numNodes:tempBuffers.numNodes,
        nextMidPoints:layoutBuffers.tempMidPoints,
        WARPSIZE:warpsize,
        THREADS_SUMS: workItems.computeSums[1],
        THREADS_FORCES: workItems.calculateForces[1],
        THREADS_BOUND: workItems.boundBox[1]
    }
    return bufferBindings;
}

var kernelParameters = {
    toKDLayout : {
        name: 'toKDLayout',
        kernelName:'to_kd_layout',
        args: ['numPoints', 'inputMidPositions',
        'inputPositions', 'xCoords', 'yCoords', 'springs', 'edgeDirectionX', 'edgeDirectionY',
        'edgeLengths', 'mass', 'blocked', 'maxDepth', 'stepNumber', 'midpoint_stride',
        'midpoints_per_edge', 'WARPSIZE', 'THREADS_BOUND', 'THREADS_FORCES', 'THREADS_SUMS'
        ],
        fileName: 'kdTree/kd-ToKDLayout.cl'
    },
    boundBox: {
        name : 'boundBox',
        kernelName: 'bound_box',
        args : ['xCoords', 'yCoords', 'children', 'mass', 'start', 'globalXMin', 'globalXMax',
            'globalYMin', 'globalYMax', 'globalEdgeMin', 'globalEdgeMax', 'swings', 'tractions',
            'count', 'blocked', 'step', 'bottom', 'radius', 'globalSpeed', 'stepNumber',
            'numBodies', 'numNodes', 'tau', 'THREADS_BOUND'],
        fileName: 'kdTree/kd-BoundBox.cl'
    },
    buildTree: {
        name: 'buildTree',
        kernelName: 'build_tree',
        args: [
        'xCoords', 'yCoords',
        'children', 'mass', 'start',
         'step', 'bottom', 'maxDepth', 'radius',
        'stepNumber', 'numBodies', 'numNodes'
        ],
        fileName: 'kdTree/kd-BuildTree.cl'
    },
    computeSums: {
        name: 'computeSums',
        kernelName: 'compute_sums',
        args: [ 'xCoords', 'yCoords', 'children', 'mass', 'count', 'step', 'bottom',
        'stepNumber', 'numBodies', 'numNodes', 'WARPSIZE', 'THREADS_SUMS'
        ],
        fileName: 'kdTree/kd-ComputeSums.cl'
    },
    sort: {
        name: 'sort',
        kernelName: 'sort',
        args: [ 'xCoords', 'yCoords', 'children', 'start', 'sort', 'count', 'step', 'bottom',
            'maxDepth', 'radius', 'globalSpeed', 'stepNumber',  'numBodies', 'numNodes', ],
        fileName: 'kdTree/kd-Sort.cl'
    },
    calculateMidPoints: {
        name: 'calculateMidPoints',
        kernelName: 'calculate_forces',
        args:[
        'xCoords', 'yCoords', 'edgeDirectionX', 'edgeDirectionY', 'edgeLengths', 'children', 'sort',
        'blocked', 'maxDepth', 'radius', 'stepNumber', 'numBodies', 'numNodes', 'nextMidPoints',
        'charge', 'midpoint_stride', 'midpoints_per_edge', 'WARPSIZE', 'THREADS_FORCES'
        ],
        fileName: 'kdTree/kd-CalculateForces.cl'
    }
}

// This implementation is designed to optimize midpoint force calculation
// by using a 4 dimensional kd-tree in order to reduce the number of calculations
// needed
var MidpointForces = function (clContext) {
    this.kernels = [];

    var that = this;

    // Create the kernels described by kernel parameters
    _.each( kernelParameters, function (kernel) {
        var newKernel =
            new Kernel(kernel.kernelName, kernel.args, argsType, kernel.fileName, clContext)
        that[kernel.name] = newKernel;
        that.kernels.push(newKernel);
    });

    this.setPhysics = function(flag) {
        // This shouldn't be called.
    };


    this.getFlags = function() {
        return undefined;
    }

    this.setArgs = function (kernel, kernelName, bufferBindings) {
        var params = kernelParameters[kernelName];
        var args = params.args;
        var flags = ['tau', 'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'stepNumber']
        try {
            var binding = {};
            _.each(args, function (element, index, list) {
                var arg = element;
                if (flags.indexOf(arg) < 0) {
                    if (bufferBindings[arg] === undefined) {
                        return eh.makeErrorHandler('Error: no buffer bindings for arguement')
                    }
                    if (bufferBindings[arg].name !== undefined) {
                        binding[arg] = bufferBindings[arg].buffer;
                    } else {
                        binding[arg] = bufferBindings[arg];
                    }
                }
            })
            return kernel.set(binding)
        } catch (e) {
            return eh.makeErrorHandler('Error setting arguments in kd-MidpointForces.js')
        }
    };


    this.setMidPoints = function(simulator, layoutBuffers, warpsize, workItems) {
        var that = this;
        return setupTempBuffers(simulator, warpsize, simulator.numEdges).then(function (tempBuffers) {
            var buffers = tempBuffers;

            var bufferBindings =
                getBufferBindings(layoutBuffers, tempBuffers, simulator, warpsize, workItems);

            return Q.all([
            that.setArgs(that.toKDLayout, 'toKDLayout', bufferBindings),
            that.setArgs(that.boundBox, "boundBox", bufferBindings),
            that.setArgs(that.buildTree, 'buildTree', bufferBindings),
            that.setArgs(that.computeSums, 'computeSums', bufferBindings),
            that.setArgs(that.sort, 'sort', bufferBindings),
            that.setArgs(that.calculateMidPoints, 'calculateMidPoints', bufferBindings)
            ]);
        }).fail(eh.makeErrorHandler('setupTempBuffers'));
    };

    this.execKernels = function(simulator, stepNumber, workItems, midpoint_index) {

        var resources = [
            simulator.buffers.curMidPoints,
            simulator.buffers.forwardsDegrees,
            simulator.buffers.backwardsDegrees,
            simulator.buffers.nextMidPoints
        ];

        this.toKDLayout.set({stepNumber: stepNumber, midpoint_stride: midpoint_index, midpoints_per_edge: simulator.numSplits});
        this.boundBox.set({stepNumber: stepNumber});
        this.buildTree.set({stepNumber: stepNumber});
        this.computeSums.set({stepNumber: stepNumber});
        this.sort.set({stepNumber: stepNumber});
        this.calculateMidPoints.set({stepNumber: stepNumber, midpoint_stride: midpoint_index, midpoints_per_edge:simulator.numSplits});

        simulator.tickBuffers(['nextMidPoints']);

        debug("Running Edge Bundling with kd-tree Kernel Sequence");

        // For all calls, we must have the # work items be a multiple of the workgroup size.
        var that = this;
        return this.toKDLayout.exec([workItems.toBarnesLayout[0]], resources, [workItems.toBarnesLayout[1]])
        .then(function () {
            return that.boundBox.exec([workItems.boundBox[0]], resources, [workItems.boundBox[1]]);
        })

        .then(function () {
            return that.buildTree.exec([workItems.buildTree[0]], resources, [workItems.buildTree[1]]);
        })

        .then(function () {
            return that.computeSums.exec([workItems.computeSums[0]], resources, [workItems.computeSums[1]]);
        })

        .then(function () {
            return that.sort.exec([workItems.sort[0]], resources, [workItems.sort[1]]);
        })

        .then(function () {
            return that.calculateMidPoints.exec([workItems.calculateForces[0]], resources, [workItems.calculateForces[1]]);
        })
        .fail(eh.makeErrorHandler("Executing kd-tree edge bundling failed"));
    };

};

module.exports = MidpointForces;


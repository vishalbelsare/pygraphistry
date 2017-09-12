'use strict';

var _     = require('underscore'),
    cljs  = require('../cl.js'),
    Q     = require('q'),
    log        = require('@graphistry/common').logger,
    logger     = log.createLogger('graph-viz', 'graph-viz/js/layouts/forceAtlas2.js');

import LayoutAlgo from '../layoutAlgo';
import _config from '@graphistry/config';
const config = _config();
const convict = global.__graphistry_convict_conf__;

var argsType = {
    THREADS_BOUND: cljs.types.define,
    THREADS_FORCES: cljs.types.define,
    THREADS_SUMS: cljs.types.define,
    WARPSIZE: cljs.types.define,
    backwardsEdges: null,
    backwardsEdgeWeights: null,
    backwardsEdgeStartEndIdxs: null,
    blocked: null,
    bottom: null,
    children: null,
    count: null,
    curForces: null,
    edgeInfluence: cljs.types.uint_t,
    flags: cljs.types.uint_t,
    forwardsEdges: null,
    forwardsEdgeWeights: null,
    forwardsEdgeStartEndIdxs: null,
    globalSpeed: null,
    globalSwings: null,
    globalTractions: null,
    globalXMax: null,
    globalXMin: null,
    globalYMax: null,
    globalYMin: null,
    gravity: cljs.types.float_t,
    height: cljs.types.float_t,
    inputPositions: null,
    isForward: cljs.types.uint_t,
    mass: null,
    maxDepth: null,
    numBodies: cljs.types.uint_t,
    numEdges: cljs.types.uint_t,
    numNodes: cljs.types.uint_t,
    numOutput: cljs.types.uint_t,
    numPoints: cljs.types.uint_t,
    numWorkItems: cljs.types.uint_t,
    outputForcesMap: null,
    outputPositions: null,
    partialForces: null,
    pointDegrees: null,
    pointForces: null,
    prevForces: null,
    radius: null,
    scalingRatio: cljs.types.float_t,
    sort: null,
    springs: null,
    start: null,
    step: null,
    stepNumber: cljs.types.uint_t,
    swings: null,
    tau: cljs.types.float_t,
    tractions: null,
    width: cljs.types.float_t,
    workList: null,
    xCoords: null,
    yCoords: null
}

// Kernel Specifications used in this layout.
// key & name: the javascript variable names of of the kernel wrappers
// kernelName: the name kernel in the .cl file.
// args: a list of the buffer names used by this kernel. They must be ordered according
// to their respective parameters in the .cl file.
// fileName: location of the .cl file.
var kernelSpecs = {
    // BarnesHut kernels used to calculate point forces
    toBarnesLayout: {
        kernelName: 'to_barnes_layout',
        args: [ 'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'numPoints',
        'inputPositions', 'xCoords', 'yCoords', 'mass', 'blocked', 'maxDepth',
        'pointDegrees', 'stepNumber'
        ],
        fileName: 'layouts/forceAtlas2/barnesHut/toBarnesLayout.cl'
    },
    boundBox: {
        kernelName: 'bound_box',
        args: ['xCoords', 'yCoords', 'children', 'mass', 'start', 'globalXMin', 'globalXMax', 
            'globalYMin', 'globalYMax', 'globalSwings', 'globalTractions', 'swings', 
            'tractions', 'blocked', 'step', 'bottom', 'radius', 'globalSpeed', 'stepNumber',
            'numBodies', 'numNodes', 'tau', 'THREADS_BOUND'
        ],
        fileName: 'layouts/forceAtlas2/barnesHut/boundBox.cl'
    },
    buildTree: {
        kernelName: 'build_tree',
        args: ['xCoords', 'yCoords', 'children', 'mass', 'start', 'bottom', 'maxDepth', 'radius',
            'numBodies', 'numNodes'
        ],
        fileName: 'layouts/forceAtlas2/barnesHut/buildTree.cl'
    },
    computeSums: {
        kernelName: 'compute_sums',
        args: ['xCoords', 'yCoords', 'children', 'mass', 'count', 'bottom', 'numBodies', 'numNodes', 
            'WARPSIZE', 'THREADS_BOUND', 'THREADS_SUMS' 
        ],
        fileName: 'layouts/forceAtlas2/barnesHut/computeSums.cl'
    },
    sort: {
        kernelName: 'sort',
        args: ['children', 'start', 'sort', 'count', 'bottom', 'numBodies', 
            'numNodes'
        ],
        fileName: 'layouts/forceAtlas2/barnesHut/sort.cl'
    },
    calculatePointForces: {
        kernelName: 'calculate_forces',
        args: ['scalingRatio', 'gravity', 'flags', 'xCoords', 'yCoords', 'children', 'mass', 'sort', 
            'step',  'maxDepth', 'radius', 'width', 'height', 'numBodies', 'numNodes', 'pointForces', 
            'WARPSIZE', 'THREADS_FORCES'
        ],
        fileName: 'layouts/forceAtlas2/barnesHut/calculatePointForces.cl'
    },
    // Edge force mapper and segmented reduce kernels used to calculate edge forces
    forwardsEdgeForceMapper : {
        kernelName: 'faEdgeMap',
        args: [ 'edgeInfluence', 'flags', 'isForward', 'forwardsEdges', 'numEdges', 'pointDegrees', 
            'inputPositions', 'forwardsEdgeWeights', 'outputForcesMap'
        ],
        fileName: 'layouts/forceAtlas2/faEdgeMap.cl'
    },
    reduceForwardsEdgeForces : {
        kernelName: 'segReduce',
        args: [ 'numEdges', 'outputForcesMap', 'forwardsEdgeStartEndIdxs',  'numPoints', 
            'partialForces', 'pointForces'
        ],
        fileName: 'segReduce.cl'
    },
    backwardsEdgeForceMapper : {
        kernelName: 'faEdgeMap',
        args: [ 'edgeInfluence', 'flags', 'isForward', 'backwardsEdges', 'numEdges', 'pointDegrees', 
            'inputPositions', 'backwardsEdgeWeights', 'outputForcesMap'
        ],
        fileName: 'layouts/forceAtlas2/faEdgeMap.cl'
    },
    reduceBackwardsEdgeForces : {
        kernelName: 'segReduce',
        args: [ 'numEdges', 'outputForcesMap', 'backwardsEdgeStartEndIdxs', 'numPoints', 'curForces', 
            'partialForces'
        ],
        fileName: 'segReduce.cl'
    },
    // ForceAtlas2 specific kernels
    faSwings: {
        kernelName: 'faSwingsTractions',
        args: ['prevForces', 'curForces', 'swings', 'tractions'],
        fileName: 'layouts/forceAtlas2/faSwingsTractions.cl'
    },
    faIntegrate: {
        kernelName: 'faIntegrate',
        args: ['globalSpeed', 'inputPositions', 'curForces', 'swings', 'flags', 'outputPositions'],
        fileName: 'layouts/forceAtlas2/faIntegrate.cl'
    }
}

function ForceAtlas2Barnes(clContext, kernelCache) {
    LayoutAlgo.call(this, 'ForceAtlas2Barnes');
    logger.trace('Creating ForceAtlasBarnes kernels');
    var that = this;
    _.each(kernelSpecs, function (kernel, name) {
        var newKernel =
            kernelCache.fetchOrCreate(kernel.kernelName, kernel.args, argsType, kernel.fileName, clContext)
        that[name] = newKernel;
        that.kernels.push(newKernel);
    });
    this.forwardsEdgeForceMapper.set({isForward: 1});
    this.backwardsEdgeForceMapper.set({isForward:0});
}

ForceAtlas2Barnes.prototype = Object.create(LayoutAlgo.prototype);
ForceAtlas2Barnes.prototype.constructor = ForceAtlas2Barnes;
ForceAtlas2Barnes.algoName = 'ForceAtlas2Barnes';

// ForceAtlas2 uses a bitmask flag in order to set settings preventOverlap, strongGravity,
// dissuadeHubs, and linLog. layoutFlags keeps track of the current state of these settings.
var layoutFlags = 0;

// The LayoutAlgo class will set all the configuration settings from the client that have
// the corresponding arguement name. For some settings, we use a boolean flag, which we must
// extract and set manually here.
ForceAtlas2Barnes.prototype.setPhysics = function(cfg) {
    LayoutAlgo.prototype.setPhysics.call(this, cfg)

    // These should correspond to the flags defined in forceAtlas2Common.h
    var flagNames = ['preventOverlap', 'strongGravity', 'dissuadeHubs', 'linLog', 'lockedX', 'lockedY', 'lockedR'];

    // Adjusts the bit vector for flags used in ForceAtlas2. See flag definitions in
    // ForceAtlas2Common.h
    _.each(cfg, function (val, flag) {
        var idx = flagNames.indexOf(flag);
        if (idx >= 0) {
            var mask = 0 | (1 << idx)
            if (val) {
                layoutFlags |= mask;
            } else {
                layoutFlags &= ~mask;
            }
        }
    });

    // Set the flags arguement for those kernels that have it.
    _.each(_.filter(this.kernels, function(k) {return k.argNames.indexOf('flags') > 0}), function(k) {
        k.set({flags: layoutFlags});
    })
}

// Returns a map from the name of the buffer used in this layout to the actual buffer
function getBufferBindings(simulator, stepNumber) {
    var workItems = getNumWorkitemsByHardware(simulator.cl.deviceProps);
    var warpsize = getWarpsize(simulator.cl.deviceProps);
    return {
        THREADS_BOUND: workItems.boundBox[1],
        THREADS_FORCES: workItems.calculateForces[1],
        THREADS_SUMS: workItems.computeSums[1],
        WARPSIZE:warpsize,
        backwardsEdges: simulator.dataframe.getBuffer('backwardsEdges', 'simulator').buffer,
        backwardsEdgeWeights: simulator.dataframe.getClBuffer(simulator.cl, 'backwardsEdgeWeights', 'hostBuffer').then( obj => obj.buffer ),
        backwardsEdgeStartEndIdxs: simulator.dataframe.getBuffer('backwardsEdgeStartEndIdxs', 'simulator').buffer,
        blocked:layoutBuffers.blocked.buffer,
        bottom:layoutBuffers.bottom.buffer,
        children:layoutBuffers.children.buffer,
        count:layoutBuffers.count.buffer,
        curForces: layoutBuffers.curForces.buffer,
        forwardsEdges: simulator.dataframe.getBuffer('forwardsEdges', 'simulator').buffer,
        forwardsEdgeWeights: simulator.dataframe.getClBuffer(simulator.cl, 'forwardsEdgeWeights', 'hostBuffer').then( obj => obj.buffer ),
        forwardsEdgeStartEndIdxs: simulator.dataframe.getBuffer('forwardsEdgeStartEndIdxs', 'simulator').buffer,
        globalSpeed: layoutBuffers.globalSpeed.buffer,
        globalSwings: layoutBuffers.globalSwings.buffer,
        globalTractions: layoutBuffers.globalTractions.buffer,
        globalXMax:layoutBuffers.xmax.buffer,
        globalXMin:layoutBuffers.xmin.buffer,
        globalYMax:layoutBuffers.ymax.buffer,
        globalYMin:layoutBuffers.ymin.buffer,
        height:simulator.controls.global.dimensions[1],
        inputPositions: simulator.dataframe.getBuffer('curPoints', 'simulator').buffer,
        mass:layoutBuffers.mass.buffer,
        maxDepth:layoutBuffers.maxdepth.buffer,
        numBodies:simulator.dataframe.getNumElements('point'),
        numEdges: simulator.dataframe.getNumElements('edge'),
        numNodes:layoutBuffers.numNodes,
        numPoints:simulator.dataframe.getNumElements('point'),
        pointDegrees: simulator.dataframe.getBuffer('degrees', 'simulator').buffer,
        partialForces: layoutBuffers.partialForces.buffer,
        pointForces: layoutBuffers.pointForces.buffer,
        prevForces: layoutBuffers.prevForces.buffer,
        outputPositions: simulator.dataframe.getBuffer('nextPoints', 'simulator').buffer,
        // TODO This should not be in simulator...
        outputForcesMap: simulator.dataframe.getBuffer('outputEdgeForcesMap', 'simulator').buffer,
        radius:layoutBuffers.radius.buffer,
        sort:layoutBuffers.sort.buffer,
        start:layoutBuffers.start.buffer,
        step:layoutBuffers.step.buffer,
        stepNumber: stepNumber,
        swings: layoutBuffers.swings.buffer,
        tractions: layoutBuffers.tractions.buffer,
        width:simulator.controls.global.dimensions[0],
        xCoords: layoutBuffers.x_cords.buffer,
        yCoords:layoutBuffers.y_cords.buffer,
    }
}

// Contains any temporary buffers needed for layout. These are set in initialize layout Buffers
var layoutBuffers  = {};

ForceAtlas2Barnes.prototype.initializeLayoutBuffers = function(simulator) {
    var workItems = getNumWorkitemsByHardware(simulator.cl.deviceProps);
    var warpsize = getWarpsize(simulator.cl.deviceProps);
    var numPoints = simulator.dataframe.getNumElements('point');

    simulator.resetBuffers(layoutBuffers);
    var sizes = computeSizes(simulator, warpsize, numPoints);
    logger.info({sizes}, 'Initializing layout buffers');
    var numNodes = sizes.numNodes;
    var num_nodes = sizes.numNodes;
    var numBodies = sizes.numBodies;
    var num_bodies = sizes.numBodies;
    var num_work_groups = sizes.numWorkGroups;

    var forwardsEdges = simulator.dataframe.getHostBuffer('forwardsEdges');
    var backwardsEdges = simulator.dataframe.getHostBuffer('backwardsEdges');
    var numEdges = simulator.dataframe.getNumElements('edge');
    return Q.all( [
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT,  'x_cords', ['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT, 'y_cords', ['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer(4*(num_nodes + 1)*Int32Array.BYTES_PER_ELEMENT, 'children', ['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT, 'mass', ['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer((num_nodes + 1)*Int32Array.BYTES_PER_ELEMENT, 'start', ['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer((num_nodes + 1)*Int32Array.BYTES_PER_ELEMENT, 'sort', ['mem_read_write', 'mem_host_no_access']  ),
        simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'global_x_mins', ['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'global_x_maxs', ['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'global_y_mins', ['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'global_y_maxs', ['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'globalSwings', ['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'globalTractions', ['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer((num_nodes + 1)*Int32Array.BYTES_PER_ELEMENT, 'count', ['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'blocked',['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'step', ['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'bottom', ['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'maxdepth', ['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer(Float32Array.BYTES_PER_ELEMENT, 'radius', ['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer(Float32Array.BYTES_PER_ELEMENT, 'global_speed', ['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer(2 * numPoints * Float32Array.BYTES_PER_ELEMENT, 'pointForces', ['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer(2 * numPoints * Float32Array.BYTES_PER_ELEMENT, 'partialForces', ['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer(2 * numPoints * Float32Array.BYTES_PER_ELEMENT, 'curForces', ['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer(2 * numPoints * Float32Array.BYTES_PER_ELEMENT, 'prevForces', ['mem_read_write']),
        simulator.cl.createBuffer(forwardsEdges.edgesTyped.byteLength, 'outputEdgeForcesMap',['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer(1 + Math.ceil(numEdges / 256), 'globalCarryIn',['mem_read_write', 'mem_host_no_access']),
        simulator.cl.createBuffer(numPoints * Float32Array.BYTES_PER_ELEMENT, 'swings', ['mem_read_write']),
        simulator.cl.createBuffer(numPoints * Float32Array.BYTES_PER_ELEMENT, 'tractions', ['mem_read_write'])
     ]).spread(function (x_cords, y_cords, children, mass, start, sort,
                         xmin, xmax, ymin, ymax, globalSwings, globalTractions, count,
                         blocked, step, bottom, maxdepth, radius, globalSpeed, pointForces, partialForces,
                        curForces, prevForces,
                        outputEdgeForcesMap, globalCarryOut, swings, tractions) {
         layoutBuffers.x_cords = x_cords;
         layoutBuffers.y_cords = y_cords;
         layoutBuffers.children = children;
         layoutBuffers.mass = mass;
         layoutBuffers.start = start;
         layoutBuffers.sort = sort;
         layoutBuffers.xmin = xmin;
         layoutBuffers.xmax = xmax;
         layoutBuffers.ymin = ymin;
         layoutBuffers.ymax = ymax;
         layoutBuffers.globalSwings = globalSwings;
         layoutBuffers.globalTractions = globalTractions;
         layoutBuffers.count = count;
         layoutBuffers.blocked = blocked;
         layoutBuffers.step = step;
         layoutBuffers.bottom = bottom;
         layoutBuffers.maxdepth = maxdepth;
         layoutBuffers.radius = radius;
         layoutBuffers.numNodes = numNodes;
         layoutBuffers.numBodies = numBodies;
         layoutBuffers.globalSpeed = globalSpeed;
         layoutBuffers.pointForces = pointForces,
         layoutBuffers.curForces = curForces,
         layoutBuffers.prevForces = prevForces,
         layoutBuffers.partialForces = partialForces,
         layoutBuffers.outputEdgeForcesMap = outputEdgeForcesMap;
         layoutBuffers.globalCarryOut = globalCarryOut;
         layoutBuffers.swings = swings;
         layoutBuffers.tractions = tractions;

         const forcesZeros = new Float32Array(numPoints * 2);
         for (let i = 0; i < forcesZeros.length; i++) {
             forcesZeros[i] = 0;
         }

         const swingZeros = new Float32Array(numPoints);
         const tractionOnes = new Float32Array(numPoints);
         for (let i = 0; i < swingZeros.length; i++) {
             swingZeros[i] = 0;
             tractionOnes[i] = 1;
         }
         return Q.all([
             swings.write(swingZeros),
             tractions.write(tractionOnes),
             prevForces.write(forcesZeros)
        ]).then(function () {
            return layoutBuffers;
        })
     }).fail(log.makeQErrorHandler(logger, "Setting temporary buffers for barnesHutKernelSequence failed"));
};

ForceAtlas2Barnes.prototype.calculateSwings = function(simulator,  workItems) {

    var resources = [
    ];

    simulator.tickBuffers(['swings', 'tractions']);
    logger.trace("Running kernel faSwingsTractions");
    return this.faSwings.exec([simulator.dataframe.getNumElements('point')], resources)
    .fail(log.makeQErrorHandler(logger, 'Executing FaSwing failed'));
};

ForceAtlas2Barnes.prototype.integrate = function(simulator, workItems) {

    var resources = [
        simulator.dataframe.getBuffer('curPoints', 'simulator'),
    ];

    simulator.tickBuffers(['nextPoints']);

    logger.trace("Running kernel faIntegrate");
    var numPoints = simulator.dataframe.getNumElements('point');
    return this.faIntegrate.exec([numPoints], resources)
    .fail(log.makeQErrorHandler(logger, 'Executing Integrate failed'));
}

ForceAtlas2Barnes.prototype.updateDataframeBuffers = function(simulator) {
    var that = this;


    var unresolvedBufferBindings = getBufferBindings(simulator, 0);
    var pairs = _.pairs(unresolvedBufferBindings);
    var keys = _.map(pairs, (p) => p[0]);
    var values = _.map(pairs, (p) => p[1]);


    return Q.all(values)
    .then(function (results) {
            var resultHash = {};
            for (var i = 0; i < results.length; i++) {
                resultHash[keys[i]] = results[i];
            }

            return that.updateBufferBindings(resultHash);
    })
    .fail(log.makeQErrorHandler(logger, 'update DataframeBuffers failed'));
};

ForceAtlas2Barnes.prototype.setEdges = function(simulator) {
    return this.initializeLayoutBuffers(simulator)
}

ForceAtlas2Barnes.prototype.pointForces = function(simulator, workItems) {

    var resources = [
        simulator.dataframe.getBuffer('curPoints', 'simulator'),
    ];

    logger.trace("Running Force Atlas2 with BarnesHut Kernels");

    // For all calls, we must have the # work items be a multiple of the workgroup size.
    var that = this;
    return this.toBarnesLayout.exec([workItems.toBarnesLayout[0]], resources, [workItems.toBarnesLayout[1]])
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
        return that.calculatePointForces.exec([workItems.calculateForces[0]], resources, [workItems.calculateForces[1]]);
    })

    .fail(log.makeQErrorHandler(logger, "Executing BarnesKernelSeq failed"));
}

ForceAtlas2Barnes.prototype.edgeForces = function(simulator, workItemsSize) {
        logger.trace("Running kernel faEdgeForces");
        var that = this;
        var resources = [];
        return that.forwardsEdgeForceMapper.exec([workItemsSize.edgeForces[0]], resources, [workItemsSize.edgeForces[1]])
        .then(function () {
            return that.reduceForwardsEdgeForces.exec([workItemsSize.segReduce[0]], resources, [workItemsSize.segReduce[1]])
        }).then(function () {
            return that.backwardsEdgeForceMapper.exec([workItemsSize.edgeForces[0]], resources, [workItemsSize.edgeForces[1]])
        }).then(function () {
            return that.reduceBackwardsEdgeForces.exec([workItemsSize.segReduce[0]], resources, [workItemsSize.segReduce[1]])
        });
}

ForceAtlas2Barnes.prototype.updateBufferBindings = function(bufferBindings) {
    _.each(this.kernels, function(kernel) {
        kernel.set(_.pick(bufferBindings, kernel.argNames));
    })
}

ForceAtlas2Barnes.prototype.tick = function(simulator, stepNumber) {
    var locks = simulator.controls.locks;
    if (locks.lockPoints) {
        var buffers = simulator.buffers;
        simulator.tickBuffers(['curPoints', 'nextPoints']);
        return Q.all([]);

    }

    // Set the step number for the kernels that have it as an arguement
    _.each(_.filter(this.kernels, function(x) { return x.argNames.indexOf('stepNumber') > 0}), function(kernel) {
        kernel.set({stepNumber: stepNumber});
    });


    var that = this;
    var tickTime = Date.now();
    var workItems = getNumWorkitemsByHardware(simulator.cl.deviceProps);
    return that.pointForces(simulator, workItems)
    .then(function () {
        return that.edgeForces(simulator, workItems);
    }).then(function () {
        return that.calculateSwings(simulator, workItems);
    }).then(function () {
        return that.integrate(simulator, workItems);
    }).then(function () {
        var buffers = simulator.buffers;
        simulator.tickBuffers(['curPoints']);
        var nextPoints = simulator.dataframe.getBuffer('nextPoints', 'simulator');
        var curPoints = simulator.dataframe.getBuffer('curPoints', 'simulator');
        var curForces = layoutBuffers.curForces;
        var prevForces = layoutBuffers.prevForces;

        return Q.all([
            nextPoints.copyInto(curPoints),
            curForces.copyInto(prevForces)
        ]);
    }).then(function () {
        return simulator;
    });
}

function getNumWorkitemsByHardware(deviceProps) {
    logger.trace({deviceProps}, 'Device props');
    const configOptions = config.GPU_OPTIONS && config.GPU_OPTIONS.SIZES;

    var sizes = {
        toBarnesLayout: [30, 256],
        boundBox: [30, 256],
        buildTree: [30, 256],
        computeSums: [10, 256],
        sort: [16, 256],
        edgeForces: [100, 256],
        segReduce: [1000, 256],
        calculateForces: [60, 256]
    };

    if (configOptions) {
        sizes = configOptions;
    } else if (deviceProps.NAME.indexOf('M370X') != -1) {
        sizes = {
            toBarnesLayout: [1, 256],
            boundBox: [1, 256],
            buildTree: [1, 256],
            computeSums: [1, 256],
            sort: [1, 256],
            edgeForces: [1, 256],
            segReduce: [8, 256],
            calculateForces: [8, 256]
        }
    } else if (deviceProps.NAME.indexOf('Intel(R) Core') != -1) {
        sizes = {
            toBarnesLayout: [8, 1],
            boundBox: [8, 1],
            buildTree: [8, 1],
            computeSums: [8, 1],
            sort: [1, 1],
            edgeForces: [1, 1],
            segReduce: [8, 1],
            calculateForces: [8, 1],
        }
    } else if (deviceProps.NAME.indexOf('GeForce GT 650M') != -1 ||
               deviceProps.NAME.indexOf('GeForce GT 750M') != -1) {
        sizes.buildTree[0] = 1;
        sizes.computeSums[0] = 1;
    } else if (deviceProps.NAME.indexOf('Iris') != -1) {
        sizes.computeSums[0] = 6;
        sizes.sort[0] = 8;
    } else if (deviceProps.NAME.indexOf('M290X') != -1 ||
               deviceProps.NAME.indexOf('AMD Radeon Pro 560') != -1) {
        sizes.buildTree[0] = 1;
        sizes.computeSums[0] = 1; //6;
        sizes.sort[0] = 1; //8;
    } else if (deviceProps.NAME.indexOf('K520') != -1) {
        // 1024
        // 30:14.1, 36:14.3, 40:13.6, 46:14.5, 50:14.1, 60:14.1, 100:14.7,
        //
        // base 14.6% @ 200

        //sizes.segReduce = [40, 1024];
        //sizes.edgeForces = [200, 1024];

        // 1024
        // 6:35, 7:31, 8:27, 9:54, 10:50, 16:38, 20:52, 26:44
        // 30:41, 36:46
        //
        // 512
        // 2:92, 6:34, 7:29, 8:26, 9:44, 10:40, 14:31, 18:41, 24:35, 30:48
        //sizes.buildTree = [8, 512];

        // 1024
        // 10:36, 14:27, 15:26, 16:24, 17:39, 18:38, 20:35, 26:28, 30:25, 36:30, 40:28, 46:25, 50:28, 60:25,
        // 70:26, 80:25, 100:26, 140:26, 200:26
        //
        // 512
        // 10:65, 20:35, 26:29, 28:27, 30:26, 34:39, 40:34
        //sizes.calculateForces = [16, 1024];

        // 1024
        // 6:4, 8:4, 10:5,
        //sizes.computeSums = [8, 1024];
        sizes = {
            toBarnesLayout: [8, 1024],
            boundBox: [8, 512],
            buildTree: [8, 256],
            computeSums: [8, 256],
            sort: [8, 512],
            edgeForces: [8, 1024],
            segReduce: [8, 512],
            calculateForces: [8, 256]
        };


    } else if (deviceProps.NAME.indexOf('HD Graphics 4000') != -1) {
        logger.debug('Expected slow kernels: sort, calculate_forces');
    }


    const gpuSizes = Object.entries(sizes).reduce((result, [key, [numWorkGroups, workGroupSize]]) => {
        result[key] = [(numWorkGroups * workGroupSize), workGroupSize];
        return result;
    }, {});

    logger.trace({gpuSizes}, 'Computed GPU workgroup and global sizes')
    return gpuSizes;
}

var computeSizes = function (simulator, warpsize, numPoints) {
    var blocks = 8; //TODO (paden) should be set to multiprocecessor count

    if (numPoints === undefined) {
        numPoints = simulator.dataframe.getNumElements('point');
    }
    var num_nodes = numPoints * 5; // TODO (paden) GPU optimization. Need to allow for more users
    if (num_nodes < 1024*blocks) num_nodes = 1024*blocks;
    while ((num_nodes & (warpsize - 1)) != 0) num_nodes++;
    num_nodes--;
    var num_bodies = numPoints;
    var numNodes = num_nodes;
    var numBodies = num_bodies;
    // Set this to the number of workgroups in boundBox kernel
    var numWorkGroups = 30;

    return {
        numWorkGroups: numWorkGroups,
        numNodes: numNodes,
        numBodies: numBodies
    };
};

var getWarpsize = function (deviceProps) {

    logger.trace({deviceProps});
    let warpsize = 1; // Always correct

    if (convict && convict.has('device.warp_size')) {
        warpsize = convict.get('device.warp_size');
    } else if (config.GPU_OPTIONS && config.GPU_OPTIONS.WARPSIZE) {
        warpsize = config.GPU_OPTIONS.WARPSIZE;
    } else {
        const { TYPE, VENDOR } = deviceProps;
        const vendor = VENDOR.toLowerCase();
        const type = TYPE.toLowerCase();
        if (type === 'cpu') {
            warpsize = 1;
        } else if (vendor.indexOf('intel') != -1) {
            warpsize = 16;
        } else if (vendor.indexOf('nvidia') != -1) {
            warpsize = 32;
        } else if (vendor.indexOf('amd') != -1) {
            warpsize = 64;
        }
    }
    logger.trace({warpsize}, `Warpsize: ${warpsize}`);
    return warpsize;

}

export default ForceAtlas2Barnes;

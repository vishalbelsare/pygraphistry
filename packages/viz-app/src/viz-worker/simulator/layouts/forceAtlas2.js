'use strict';

var _     = require('underscore'),
    cljs  = require('../cl.js'),
    Q     = require('q'),

    LayoutAlgo = require('../layoutAlgo.js'),
    Kernel = require('../kernel.js'),
    log        = require('@graphistry/common').logger,
    logger     = log.createLogger('graph-viz', 'graph-viz/js/layouts/forceAtlas2.js');

import _config from '@graphistry/config';
const config = _config();

var argsType = {
        ONE: cljs.types.uint_t,
        ZERO: cljs.types.uint_t,
        THREADS_BOUND: cljs.types.define,
        THREADS_FORCES: cljs.types.define,
        THREADS_SUMS: cljs.types.define,
        WARPSIZE: cljs.types.define,
        accX: null,
        accY: null,
        backwardsEdges: null,
        backwardsEdgeWeights: null,
        backwardsEdgeStartEndIdxs: null,
        backwardsWorkItems: null,
        blocked: null,
        bottom: null,
        carryOutGlobal: null,
        children: null,
        count: null,
        curForces: null,
        edgeInfluence: cljs.types.uint_t,
        edgeStartEndIdxs: null,
        edgeWeights: null,
        edges: null,
        flags: cljs.types.uint_t,
        forwardsEdges: null,
        forwardsEdgeWeights: null,
        forwardsEdgeStartEndIdxs: null,
        forwardsWorkItems: null,
        gSpeed: cljs.types.float_t,
        gSpeeds: null,
        globalSpeed: null,
        globalSwings: null,
        globalTractions: null,
        globalXMax: null,
        globalXMin: null,
        globalYMax: null,
        globalYMin: null,
        gravity: cljs.types.float_t,
        height: cljs.types.float_t,
        input: null,
        inputPoints: null,
        inputPositions: null,
        intermediateForcesMap: null,
        isForward: cljs.types.uint_t,
        mass: null,
        maxDepth: null,
        numBodies: cljs.types.uint_t,
        numEdges: cljs.types.uint_t,
        numInput: cljs.types.uint_t,
        numMidPoints: cljs.types.uint_t,
        numNodes: cljs.types.uint_t,
        numOutput: cljs.types.uint_t,
        numPoints: cljs.types.uint_t,
        numWorkItems: cljs.types.uint_t,
        output: null,
        outputForces: null,
        outputForcesMap: null,
        outputPoints: null,
        outputPositions: null,
        partialForces: null,
        pointDegrees: null,
        pointForces: null,
        prevForces: null,
        radius: null,
        scalingRatio: cljs.types.float_t,
        segStart: null,
        sort: null,
        springs: null,
        start: null,
        step: null,
        stepNumber: cljs.types.uint_t,
        swings: null,
        tau: cljs.types.float_t,
        tilePointsParam2: cljs.types.local_t,
        tilePointsParam: cljs.types.local_t,
        tilesPerIteration: cljs.types.uint_t,
        tractions: null,
        width: cljs.types.float_t,
        workList: null,
        xCoords: null,
        yCoords: null
    }


// Many BarnesHut kernels have same arguements
var barnesHutCommonArgs = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'xCoords',
    'yCoords', 'accX', 'accY', 'children', 'mass', 'start',
    'sort', 'globalXMin', 'globalXMax', 'globalYMin', 'globalYMax', 'swings', 'tractions',
    'count', 'blocked', 'step', 'bottom', 'maxDepth', 'radius', 'globalSpeed', 'stepNumber',
    'width', 'height', 'numBodies', 'numNodes', 'pointForces', 'tau', 'WARPSIZE',
    'THREADS_BOUND', 'THREADS_FORCES', 'THREADS_SUMS'
];

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
        'pointDegrees', 'stepNumber', 'WARPSIZE', 'THREADS_BOUND', 'THREADS_FORCES', 'THREADS_SUMS'
        ],
        fileName: 'layouts/forceAtlas2/barnesHut/toBarnesLayout.cl'
    },
    boundBox: {
        kernelName: 'bound_box',
        args: ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'xCoords',
        'yCoords', 'accX', 'accY', 'children', 'mass', 'start',
        'sort', 'globalXMin', 'globalXMax', 'globalYMin', 'globalYMax', 'globalSwings', 'globalTractions', 'swings', 'tractions',
        'count', 'blocked', 'step', 'bottom', 'maxDepth', 'radius', 'globalSpeed', 'stepNumber',
        'width', 'height', 'numBodies', 'numNodes', 'pointForces', 'tau', 'WARPSIZE',
        'THREADS_BOUND', 'THREADS_FORCES', 'THREADS_SUMS'
        ],
        fileName: 'layouts/forceAtlas2/barnesHut/boundBox.cl'
    },
    buildTree: {
        kernelName: 'build_tree',
        args: barnesHutCommonArgs,
        fileName: 'layouts/forceAtlas2/barnesHut/buildTree.cl'
    },
    computeSums: {
        kernelName: 'compute_sums',
        args: barnesHutCommonArgs,
        fileName: 'layouts/forceAtlas2/barnesHut/computeSums.cl'
    },
    sort: {
        kernelName: 'sort',
        args: barnesHutCommonArgs,
        fileName: 'layouts/forceAtlas2/barnesHut/sort.cl'
    },
    calculatePointForces: {
        kernelName: 'calculate_forces',
        args: barnesHutCommonArgs,
        fileName: 'layouts/forceAtlas2/barnesHut/calculatePointForces.cl'
    },
    // Edge force mapper and segmented reduce kernels used to calculate edge forces
    forwardsEdgeForceMapper : {
        kernelName: 'faEdgeMap',
        args: [ 'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'isForward', 'forwardsEdges',
            'numEdges', 'pointDegrees', 'inputPositions', 'forwardsEdgeWeights', 'outputForcesMap'
        ],
        fileName: 'layouts/forceAtlas2/faEdgeMap.cl'
    },
    reduceForwardsEdgeForces : {
        kernelName: 'segReduce',
        args: [ 'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'numEdges', 'outputForcesMap',
        'forwardsEdgeStartEndIdxs', 'segStart', 'forwardsWorkItems', 'numPoints', 'carryOutGlobal',
        'partialForces', 'pointForces'
        ],
        fileName: 'segReduce.cl'
    },
    backwardsEdgeForceMapper : {
        kernelName: 'faEdgeMap',
        args: [ 'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'isForward', 'backwardsEdges',
            'numEdges', 'pointDegrees', 'inputPositions', 'backwardsEdgeWeights', 'outputForcesMap'
        ],
        fileName: 'layouts/forceAtlas2/faEdgeMap.cl'
    },
    reduceBackwardsEdgeForces : {
        kernelName: 'segReduce',
        args: [ 'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'numEdges', 'outputForcesMap',
        'backwardsEdgeStartEndIdxs', 'segStart', 'backwardsWorkItems', 'numPoints',
        'carryOutGlobal', 'curForces', 'partialForces'
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
        args: ['globalSpeed', 'inputPositions', 'curForces', 'swings', 'outputPositions'],
        fileName: 'layouts/forceAtlas2/faIntegrate.cl'
    }
}

function ForceAtlas2Barnes(clContext) {
    LayoutAlgo.call(this, 'ForceAtlas2Barnes');
    logger.trace('Creating ForceAtlasBarnes kernels');
    var that = this;
    _.each(kernelSpecs, function (kernel, name) {
        var newKernel =
            new Kernel(kernel.kernelName, kernel.args, argsType, kernel.fileName, clContext)
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
    var flagNames = ['preventOverlap', 'strongGravity', 'dissuadeHubs', 'linLog'];

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
        accX:layoutBuffers.accx.buffer,
        accY:layoutBuffers.accy.buffer,
        backwardsEdges: simulator.dataframe.getBuffer('backwardsEdges', 'simulator').buffer,
        backwardsEdgeWeights: simulator.dataframe.getClBuffer(simulator.cl, 'backwardsEdgeWeights', 'hostBuffer').then( obj => obj.buffer ),
        backwardsWorkItems: simulator.dataframe.getBuffer('backwardsWorkItems', 'simulator').buffer,
        backwardsEdgeStartEndIdxs: simulator.dataframe.getBuffer('backwardsEdgeStartEndIdxs', 'simulator').buffer,
        blocked:layoutBuffers.blocked.buffer,
        bottom:layoutBuffers.bottom.buffer,
        carryOutGlobal: simulator.dataframe.getBuffer('globalCarryOut', 'simulator').buffer,
        children:layoutBuffers.children.buffer,
        count:layoutBuffers.count.buffer,
        curForces: simulator.dataframe.getBuffer('curForces', 'simulator').buffer,
        forwardsEdges: simulator.dataframe.getBuffer('forwardsEdges', 'simulator').buffer,
        forwardsEdgeWeights: simulator.dataframe.getClBuffer(simulator.cl, 'forwardsEdgeWeights', 'hostBuffer').then( obj => obj.buffer ),
        forwardsWorkItems: simulator.dataframe.getBuffer('forwardsWorkItems', 'simulator').buffer,
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
        prevForces: simulator.dataframe.getBuffer('prevForces', 'simulator').buffer,
        outputPositions: simulator.dataframe.getBuffer('nextPoints', 'simulator').buffer,
        // TODO This should not be in simulator...
        outputForcesMap: simulator.dataframe.getBuffer('outputEdgeForcesMap', 'simulator').buffer,
        radius:layoutBuffers.radius.buffer,
        segStart: simulator.dataframe.getBuffer('segStart', 'simulator').buffer,
        sort:layoutBuffers.sort.buffer,
        start:layoutBuffers.start.buffer,
        step:layoutBuffers.step.buffer,
        stepNumber: stepNumber,
        swings: simulator.dataframe.getBuffer('swings', 'simulator').buffer,
        tractions: simulator.dataframe.getBuffer('tractions', 'simulator').buffer,
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
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT,  'x_cords'),
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT, 'y_cords'),
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT, 'accx'),
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT, 'accy'),
        simulator.cl.createBuffer(4*(num_nodes + 1)*Int32Array.BYTES_PER_ELEMENT, 'children'),
        simulator.cl.createBuffer((num_nodes + 1)*Float32Array.BYTES_PER_ELEMENT, 'mass'),
        simulator.cl.createBuffer((num_nodes + 1)*Int32Array.BYTES_PER_ELEMENT, 'start'),
        simulator.cl.createBuffer((num_nodes + 1)*Int32Array.BYTES_PER_ELEMENT, 'sort'),
        simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'global_x_mins'),
        simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'global_x_maxs'),
        simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'global_y_mins'),
        simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'global_y_maxs'),
        simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'globalSwings'),
        simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'globalTractions'),
        simulator.cl.createBuffer((num_nodes + 1)*Int32Array.BYTES_PER_ELEMENT, 'count'),
        simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'blocked'),
        simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'step'),
        simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'bottom'),
        simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'maxdepth'),
        simulator.cl.createBuffer(Float32Array.BYTES_PER_ELEMENT, 'radius'),
        simulator.cl.createBuffer(Float32Array.BYTES_PER_ELEMENT, 'global_speed'),
        simulator.cl.createBuffer(2 * numPoints * Float32Array.BYTES_PER_ELEMENT, 'pointForces'),
        simulator.cl.createBuffer(2 * numPoints * Float32Array.BYTES_PER_ELEMENT, 'partialForces'),
        simulator.cl.createBuffer(forwardsEdges.edgesTyped.byteLength, 'outputEdgeForcesMap'),
        simulator.cl.createBuffer(1 + Math.ceil(numEdges / 256), 'globalCarryIn'),
        simulator.cl.createBuffer(forwardsEdges.edgeStartEndIdxsTyped.byteLength, 'forwardsEdgeStartEndIdxs'),
        simulator.cl.createBuffer(backwardsEdges.edgeStartEndIdxsTyped.byteLength, 'backwardsEdgeStartEndIdxs'),
        simulator.cl.createBuffer((numPoints * Float32Array.BYTES_PER_ELEMENT) / 2, 'segStart')
     ]).spread(function (x_cords, y_cords, accx, accy, children, mass, start, sort,
                         xmin, xmax, ymin, ymax, globalSwings, globalTractions, count,
                         blocked, step, bottom, maxdepth, radius, globalSpeed, pointForces, partialForces,
                        outputEdgeForcesMap, globalCarryOut, forwardsEdgeStartEndIdxs,
                        backwardsEdgeStartEndIdxs, segStart) {
         layoutBuffers.x_cords = x_cords;
         layoutBuffers.y_cords = y_cords;
         layoutBuffers.accx = accx;
         layoutBuffers.accy = accy;
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
         layoutBuffers.partialForces = partialForces,
         layoutBuffers.outputEdgeForcesMap = outputEdgeForcesMap;
         layoutBuffers.globalCarryOut = globalCarryOut;
         layoutBuffers.forwardsEdgeStartEndIdxs = forwardsEdgeStartEndIdxs;
         layoutBuffers.backwardsEdgeStartEndIdxs = backwardsEdgeStartEndIdxs;
         layoutBuffers.segStart = segStart;
         return Q.all([
            layoutBuffers.forwardsEdgeStartEndIdxs.write(forwardsEdges.edgeStartEndIdxsTyped),
            layoutBuffers.backwardsEdgeStartEndIdxs.write(backwardsEdges.edgeStartEndIdxsTyped)
        ]).then(function () {
            return layoutBuffers;
        })
     }).fail(log.makeQErrorHandler(logger, "Setting temporary buffers for barnesHutKernelSequence failed"));
};

ForceAtlas2Barnes.prototype.calculateSwings = function(simulator,  workItems) {

    var resources = [
        simulator.dataframe.getBuffer('prevForces', 'simulator'),
        simulator.dataframe.getBuffer('curForces', 'simulator'),
        simulator.dataframe.getBuffer('swings', 'simulator'),
        simulator.dataframe.getBuffer('tractions', 'simulator')
    ];

    simulator.tickBuffers(['swings', 'tractions']);
    logger.trace("Running kernel faSwingsTractions");
    return this.faSwings.exec([simulator.dataframe.getNumElements('point')], resources)
    .fail(log.makeQErrorHandler(logger, 'Executing FaSwing failed'));
};

ForceAtlas2Barnes.prototype.integrate = function(simulator, workItems) {

    var resources = [
        simulator.dataframe.getBuffer('curPoints', 'simulator'),
        simulator.dataframe.getBuffer('curForces', 'simulator'),
        simulator.dataframe.getBuffer('swings', 'simulator'),
        simulator.dataframe.getBuffer('nextPoints', 'simulator')
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

    return Q.all(values).then(function (results) {
        var resultHash = {};
        for (var i = 0; i < results.length; i++) {
            resultHash[keys[i]] = results[i];
        }

        return that.updateBufferBindings(resultHash);
    });
};

ForceAtlas2Barnes.prototype.setEdges = function(simulator) {
    return this.initializeLayoutBuffers(simulator)
}

ForceAtlas2Barnes.prototype.pointForces = function(simulator, workItems) {

    var resources = [
        simulator.dataframe.getBuffer('curPoints', 'simulator'),
        simulator.dataframe.getBuffer('forwardsDegrees', 'simulator'),
        simulator.dataframe.getBuffer('backwardsDegrees', 'simulator'),
        simulator.dataframe.getBuffer('partialForces1', 'simulator')
    ];

    simulator.tickBuffers(['partialForces1']);

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
    } else if (deviceProps.NAME.indexOf('Iris Pro') != -1) {
        sizes.computeSums[0] = 6;
        sizes.sort[0] = 8;
    } else if (deviceProps.NAME.indexOf('Iris') != -1) {
        sizes.computeSums[0] = 6;
        sizes.sort[0] = 8;
    } else if (deviceProps.NAME.indexOf('M290X') != -1) {
        sizes.buildTree[0] = 1;
        sizes.computeSums[0] = 1;
        sizes.computeSums[0] = 1; //6;
        sizes.sort[0] = 1; //8;
    } else if (deviceProps.NAME.indexOf('K520') != -1) {
        // 1024
        // 30:14.1, 36:14.3, 40:13.6, 46:14.5, 50:14.1, 60:14.1, 100:14.7,
        //
        // base 14.6% @ 200

        sizes.segReduce = [40, 1024];
        sizes.edgeForces = [200, 1024];

        // 1024
        // 6:35, 7:31, 8:27, 9:54, 10:50, 16:38, 20:52, 26:44
        // 30:41, 36:46
        //
        // 512
        // 2:92, 6:34, 7:29, 8:26, 9:44, 10:40, 14:31, 18:41, 24:35, 30:48
        sizes.buildTree = [8, 512];

        // 1024
        // 10:36, 14:27, 15:26, 16:24, 17:39, 18:38, 20:35, 26:28, 30:25, 36:30, 40:28, 46:25, 50:28, 60:25,
        // 70:26, 80:25, 100:26, 140:26, 200:26
        //
        // 512
        // 10:65, 20:35, 26:29, 28:27, 30:26, 34:39, 40:34
        sizes.calculateForces = [16, 1024];

        // 1024
        // 6:4, 8:4, 10:5,
        sizes.computeSums = [8, 1024];


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
    const { TYPE, VENDOR } = deviceProps;
    const vendor = VENDOR.toLowerCase();
    const type = TYPE.toLowerCase();
    var warpsize = 1; // Always correct
    if (config.GPU_OPTIONS && config.GPU_OPTIONS.WARPSIZE) {
        warpsize = config.GPU_OPTIONS.WARPSIZE;
    } else if (type === 'cpu') {
        warpsize = 1;
    } else if (vendor.indexOf('intel') != -1) {
        warpsize = 16;
    } else if (vendor.indexOf('nvidia') != -1) {
        warpsize = 32;
    } else if (vendor.indexOf('amd') != -1) {
        warpsize = 64;
    }
    logger.trace({warpsize}, `Warpsize: ${warpsize}`);
    return warpsize;

}

module.exports = ForceAtlas2Barnes;

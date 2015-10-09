'use strict';

var _     = require('underscore'),
    cljs  = require('../../../cl.js'),
    Q     = require('q'),

    LayoutAlgo = require('../../../layoutAlgo.js'),
    Kernel = require('../../../kernel.js'),
    BarnesKernelSeq = require('./pointForces.js'),
    EdgeKernelSeqFast = require('./edgeForces'),
    integrateKernel = require('./integrateKernel.js'),
    ArgsType = require('../../ArgsType.js'),

    log        = require('common/logger.js'),
    logger     = log.createLogger('graph-viz:cl:forceatlas2barnes');



function ForceAtlas2Barnes(clContext) {
    LayoutAlgo.call(this, ForceAtlas2Barnes.name);

    logger.trace('Creating ForceAtlasBarnes kernels');
    this.argsToBarnesLayout = [
        'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'numPoints',
        'inputPositions', 'xCoords', 'yCoords', 'mass', 'blocked', 'maxDepth',
        'pointDegrees', 'stepNumber', 'WARPSIZE', 'THREADS_BOUND', 'THREADS_FORCES', 'THREADS_SUMS'
    ];

    // All Barnes kernels have same arguements
    this.argsBarnes = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'xCoords',
        'yCoords', 'accX', 'accY', 'children', 'mass', 'start',
        'sort', 'globalXMin', 'globalXMax', 'globalYMin', 'globalYMax', 'swings', 'tractions',
        'count', 'blocked', 'step', 'bottom', 'maxDepth', 'radius', 'globalSpeed', 'stepNumber',
        'width', 'height', 'numBodies', 'numNodes', 'pointForces', 'tau', 'WARPSIZE',
        'THREADS_BOUND', 'THREADS_FORCES', 'THREADS_SUMS'
    ];

    this.argsBoundBox = ['scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'xCoords',
        'yCoords', 'accX', 'accY', 'children', 'mass', 'start',
        'sort', 'globalXMin', 'globalXMax', 'globalYMin', 'globalYMax', 'globalSwings', 'globalTractions', 'swings', 'tractions',
        'count', 'blocked', 'step', 'bottom', 'maxDepth', 'radius', 'globalSpeed', 'stepNumber',
        'width', 'height', 'numBodies', 'numNodes', 'pointForces', 'tau', 'WARPSIZE',
        'THREADS_BOUND', 'THREADS_FORCES', 'THREADS_SUMS'
    ];

    this.argsType = {
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
        charge: cljs.types.float_t,
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
        globalSwings: null,
        globalTractions: null,
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
        WARPSIZE: cljs.types.define,
        THREADS_BOUND: cljs.types.define,
        THREADS_FORCES: cljs.types.define,
        THREADS_SUMS: cljs.types.define
    }

    this.toBarnesLayout = new Kernel('to_barnes_layout', this.argsToBarnesLayout,
            this.argsType, 'layouts/gpu/ForceAtlas2/barnesHut/toBarnesLayout.cl', clContext);

    this.boundBox = new Kernel('bound_box', this.argsBoundBox,
            this.argsType, 'layouts/gpu/ForceAtlas2/barnesHut/boundBox.cl', clContext);

    this.buildTree = new Kernel('build_tree', this.argsBarnes,
            this.argsType, 'layouts/gpu/ForceAtlas2/barnesHut/buildTree.cl', clContext);

    this.computeSums = new Kernel('compute_sums', this.argsBarnes,
            this.argsType, 'layouts/gpu/ForceAtlas2/barnesHut/computeSums.cl', clContext);

    this.sort = new Kernel('sort', this.argsBarnes,
            this.argsType, 'layouts/gpu/ForceAtlas2/barnesHut/sort.cl', clContext);

    this.calculatePointForces = new Kernel('calculate_forces', this.argsBarnes,
            this.argsType, 'layouts/gpu/ForceAtlas2/barnesHut/calculatePointForces.cl', clContext);

    this.argsMapEdges = [
        'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'isForward', 'edges', 'numEdges',
        'pointDegrees', 'inputPoints', 'edgeWeights', 'outputForcesMap'
    ];

    this.argsSegReduce = [
        'scalingRatio', 'gravity', 'edgeInfluence', 'flags', 'numInput', 'input',
        'edgeStartEndIdxs', 'segStart', 'workList', 'numOutput', 'carryOutGlobal', 'output', 'partialForces'
    ];

    this.mapEdges = new Kernel('faEdgeMap', this.argsMapEdges, ArgsType, 'layouts/gpu/forceAtlas2/faEdgeMap.cl', clContext);

    this.segReduce = new Kernel("segReduce", this.argsSegReduce,
                                ArgsType, 'segReduce.cl', clContext);

    var faSwingsArgs = { prevForces : null, curForces : null, swings : null, tractions : null }
    this.faSwings = new Kernel('faSwingsTractions', Object.keys(faSwingsArgs), faSwingsArgs,
                               'layouts/gpu/forceAtlas2/faSwingsTractions.cl', clContext);

    var integrateArgs = { globalSpeed : null, inputPositions: null, curForces: null, swings: null,
        outputPositions: null }

    this.faIntegrate = new Kernel('faIntegrate', Object.keys(integrateArgs), integrateArgs,
                                  'layouts/gpu/forceAtlas2/faIntegrate.cl', clContext);

    this.integrateKernel = new integrateKernel(clContext);

    this.kernels = this.kernels.concat([this.toBarnesLayout, this.boundBox, this.buildTree, this.computeSums,
                                        this.sort, this.calculatePointForces,
                                        this.faSwings,
                                        this.faIntegrate, this.mapEdges, this.segReduce]);
}

ForceAtlas2Barnes.prototype = Object.create(LayoutAlgo.prototype);
ForceAtlas2Barnes.prototype.constructor = ForceAtlas2Barnes;
ForceAtlas2Barnes.name = 'ForceAtlas2Barnes';

ForceAtlas2Barnes.prototype.setPhysics = function(cfg) {
    LayoutAlgo.prototype.setPhysics.call(this, cfg)

    // get the flags from previous iteration
    var flags = this.toBarnesLayout.get('flags');
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

    this.toBarnesLayout.set({flags: flags});
    this.boundBox.set({flags: flags});
    this.buildTree.set({flags: flags});
    this.computeSums.set({flags: flags});
    this.sort.set({flags: flags});
    this.calculatePointForces.set({flags: flags});
    this.mapEdges.set({flags:flags});
    this.segReduce.set({flags:flags});
}

// Contains any temporary buffers needed for layout
var layoutBuffers  = {
    globalSpeed: null,
    x_cords: null,
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
    globalSwings: null,
    globalTractions: null,
    count: null,
    blocked: null,
    step: null,
    bottom: null,
    maxdepth: null,
};

ForceAtlas2Barnes.prototype.setArgsPointForces = function(simulator, warpsize, workItems) {
    var tempBuffers = layoutBuffers;
    var that = this;
    that.toBarnesLayout.set({
        xCoords: layoutBuffers.x_cords.buffer,
        yCoords:layoutBuffers.y_cords.buffer,
        mass:layoutBuffers.mass.buffer,
        blocked:layoutBuffers.blocked.buffer,
        maxDepth:layoutBuffers.maxdepth.buffer,
        numPoints:simulator.dataframe.getNumElements('point'),
        inputPositions: simulator.dataframe.getBuffer('curPoints', 'simulator').buffer,
        pointDegrees: simulator.dataframe.getBuffer('degrees', 'simulator').buffer,
        WARPSIZE: warpsize,
        THREADS_SUMS: workItems.computeSums[1],
        THREADS_FORCES: workItems.calculateForces[1],
        THREADS_BOUND: workItems.boundBox[1]
    });

    var setBarnesKernelArgs = function(kernel, buffers) {
        var setArgs = {
        xCoords:buffers.x_cords.buffer,
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
        swings:simulator.dataframe.getBuffer('swings', 'simulator').buffer,
        tractions: simulator.dataframe.getBuffer('tractions', 'simulator').buffer,
        count:buffers.count.buffer,
        blocked:buffers.blocked.buffer,
        bottom:buffers.bottom.buffer,
        step:buffers.step.buffer,
        maxDepth:buffers.maxdepth.buffer,
        radius:buffers.radius.buffer,
        globalSpeed: layoutBuffers.globalSpeed.buffer,
        width:simulator.controls.global.dimensions[0],
        height:simulator.controls.global.dimensions[1],
        numBodies:buffers.numBodies,
        numNodes:buffers.numNodes,
        pointForces: simulator.dataframe.getBuffer('partialForces1', 'simulator').buffer,
        WARPSIZE:warpsize,
        THREADS_SUMS: workItems.computeSums[1],
        THREADS_FORCES: workItems.calculateForces[1],
        THREADS_BOUND: workItems.boundBox[1]};
        kernel.set(setArgs);
    };

    var buffers = layoutBuffers;
    that.boundBox.set({
        xCoords:buffers.x_cords.buffer,
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
        globalSwings: buffers.globalSwings.buffer,
        globalTractions: buffers.globalTractions.buffer,
        swings:simulator.dataframe.getBuffer('swings', 'simulator').buffer,
        tractions: simulator.dataframe.getBuffer('tractions', 'simulator').buffer,
        count:buffers.count.buffer,
        blocked:buffers.blocked.buffer,
        bottom:buffers.bottom.buffer,
        step:buffers.step.buffer,
        maxDepth:buffers.maxdepth.buffer,
        radius:buffers.radius.buffer,
        globalSpeed: layoutBuffers.globalSpeed.buffer,
        width:simulator.controls.global.dimensions[0],
        height:simulator.controls.global.dimensions[1],
        numBodies:buffers.numBodies,
        numNodes:buffers.numNodes,
        pointForces: simulator.dataframe.getBuffer('partialForces1', 'simulator').buffer,
        WARPSIZE:warpsize,
        THREADS_SUMS: workItems.computeSums[1],
        THREADS_FORCES: workItems.calculateForces[1],
        THREADS_BOUND: workItems.boundBox[1]
    });

    setBarnesKernelArgs(that.buildTree, layoutBuffers);
    setBarnesKernelArgs(that.computeSums, layoutBuffers);
    setBarnesKernelArgs(that.sort, layoutBuffers);
    setBarnesKernelArgs(that.calculatePointForces, layoutBuffers);
}

ForceAtlas2Barnes.prototype.initializeLayoutBuffers = function(simulator, warpsize, numPoints) {
    simulator.resetBuffers(layoutBuffers);
    var sizes = computeSizes(simulator, warpsize, numPoints);
    var numNodes = sizes.numNodes;
    var num_nodes = sizes.numNodes;
    var numBodies = sizes.numBodies;
    var num_bodies = sizes.numBodies;
    var num_work_groups = sizes.numWorkGroups;

    var forwardsEdges = simulator.dataframe.getHostBuffer('forwardsEdges');
    var backwardsEdges = simulator.dataframe.getHostBuffer('backwardsEdges');
    var numEdges = simulator.dataframe.getNumElements('edge');
    var numPoints = simulator.dataframe.getNumElements('point');
    return Q.all( [
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
        simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'globalSwings'),
        simulator.cl.createBuffer((num_work_groups)*Float32Array.BYTES_PER_ELEMENT, 'globalTractions'),
        simulator.cl.createBuffer((num_nodes + 1)*Int32Array.BYTES_PER_ELEMENT, 'count'),
        simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'blocked'),
        simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'step'),
        simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'bottom'),
        simulator.cl.createBuffer(Int32Array.BYTES_PER_ELEMENT, 'maxdepth'),
        simulator.cl.createBuffer(Float32Array.BYTES_PER_ELEMENT, 'radius'),
        simulator.cl.createBuffer(Float32Array.BYTES_PER_ELEMENT, 'global_speed'),
        simulator.cl.createBuffer(forwardsEdges.edgesTyped.byteLength, 'outputEdgeForcesMap'),
        simulator.cl.createBuffer(1 + Math.ceil(numEdges / 256), 'globalCarryIn'),
        simulator.cl.createBuffer(forwardsEdges.edgeStartEndIdxsTyped.byteLength, 'forwardsEdgeStartEndIdxs'),
        simulator.cl.createBuffer(backwardsEdges.edgeStartEndIdxsTyped.byteLength, 'backwardsEdgeStartEndIdxs'),
        simulator.cl.createBuffer((numPoints * Float32Array.BYTES_PER_ELEMENT) / 2, 'segStart')
     ]).spread(function (x_cords, y_cords, accx, accy, children, mass, start, sort,
                         xmin, xmax, ymin, ymax, globalSwings, globalTractions, count,
                         blocked, step, bottom, maxdepth, radius, globalSpeed,
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

ForceAtlas2Barnes.prototype.calculateSwings = function(simulator, workItems) {
    var buffers = simulator.buffers;
    this.faSwings.set({
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
    return this.faSwings.exec([simulator.dataframe.getNumElements('point')], resources)
    .fail(log.makeQErrorHandler(logger, 'Executing FaSwing failed'));
};

ForceAtlas2Barnes.prototype.integrate = function(simulator) {
    var buffers = simulator.buffers;
    var numPoints = simulator.dataframe.getNumElements('point');

    this.faIntegrate.set({
        globalSpeed: layoutBuffers.globalSpeed.buffer,
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
    return this.faIntegrate.exec([numPoints], resources)
    .fail(log.makeQErrorHandler(logger, 'Executing Integrate failed'));
}

ForceAtlas2Barnes.prototype.updateDataframeBuffers = function(simulator) {
    var vendor = simulator.cl.deviceProps.VENDOR.toLowerCase();
    var warpsize = getWarpsize(vendor);

    var that = this;
    var sizes = computeSizes(simulator, warpsize, simulator.dataframe.getNumElements('point'));
    var numNodes = sizes.numNodes;
    var numBodies = sizes.numBodies;

    that.toBarnesLayout.set({
        numPoints: simulator.dataframe.getNumElements('point'),
        inputPositions: simulator.dataframe.getBuffer('curPoints', 'simulator').buffer,
        pointDegrees: simulator.dataframe.getBuffer('degrees', 'simulator').buffer
    });

    that.boundBox.set({
            swings:simulator.dataframe.getBuffer('swings', 'simulator').buffer,
            tractions: simulator.dataframe.getBuffer('tractions', 'simulator').buffer,
            pointForces: simulator.dataframe.getBuffer('partialForces1', 'simulator').buffer,
            numBodies: numBodies,
            numNodes: numNodes
    });

    var updateBarnesArgs = function (kernel) {
        var args = {
            swings: simulator.dataframe.getBuffer('swings', 'simulator').buffer,
            tractions: simulator.dataframe.getBuffer('tractions', 'simulator').buffer,
            pointForces: simulator.dataframe.getBuffer('partialForces1', 'simulator').buffer,
            numBodies: numBodies,
            numNodes: numNodes
        };
        kernel.set(args);
    };

    updateBarnesArgs(that.buildTree);
    updateBarnesArgs(that.computeSums);
    updateBarnesArgs(that.sort);
    updateBarnesArgs(that.calculatePointForces);
};

ForceAtlas2Barnes.prototype.setEdges = function(simulator) {
    var numMidPoints = simulator.dataframe.getNumElements('midPoints');
    var localPosSize =
        Math.min(simulator.cl.maxThreads, numMidPoints)
    * simulator.elementsPerPoint
    * Float32Array.BYTES_PER_ELEMENT;

    var global = simulator.controls.global;
    var that = this;

    var vendor = simulator.cl.deviceProps.VENDOR.toLowerCase();
    var warpsize = getWarpsize(vendor);

    var workItems = getNumWorkitemsByHardware(simulator.cl.deviceProps);
    var that = this;
    console.log("HERE layout", layoutBuffers);
    return this.initializeLayoutBuffers(simulator);
}

ForceAtlas2Barnes.prototype.pointForces = function(simulator, stepNumber, workItems) {
    var resources = [
        simulator.dataframe.getBuffer('curPoints', 'simulator'),
        simulator.dataframe.getBuffer('forwardsDegrees', 'simulator'),
        simulator.dataframe.getBuffer('backwardsDegrees', 'simulator'),
        simulator.dataframe.getBuffer('partialForces1', 'simulator')
    ];
    var vendor = simulator.cl.deviceProps.VENDOR.toLowerCase();
    var warpsize = getWarpsize(vendor);
    console.log("POintForces", layoutBuffers);
    this.setArgsPointForces(simulator, warpsize, workItems);

    this.toBarnesLayout.set({stepNumber: stepNumber});
    this.boundBox.set({stepNumber: stepNumber});
    this.buildTree.set({stepNumber: stepNumber});
    this.computeSums.set({stepNumber: stepNumber});
    this.sort.set({stepNumber: stepNumber});
    this.calculatePointForces.set({stepNumber: stepNumber});

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

ForceAtlas2Barnes.prototype.edgeForces2 = function(simulator, stepNumber, workItemsSize) {

    var dataframe = simulator.dataframe;
    var forwardsEdges = dataframe.getBuffer('forwardsEdges', 'simulator');
    var forwardsWorkItems = dataframe.getBuffer('forwardsWorkItems', 'simulator')
    var backwardsEdges = dataframe.getBuffer('backwardsEdges', 'simulator');
    var backwardsWorkItems = dataframe.getBuffer('backwardsWorkItems', 'simulator')
    var points = dataframe.getBuffer('curPoints', 'simulator');
    var pointDegrees = dataframe.getBuffer('degrees', 'simulator');
    var mapEdges = this.mapEdges;
    var segReduce = this.segReduce;

    function edgeForcesOneWay(simulator, edges, workItems, points, pointDegrees, edgeWeights, partialForces, outputForces, startEnd, workItemsSize, isForward) {
        var numEdges = simulator.dataframe.getNumElements('edge');
        var numPoints = simulator.dataframe.getNumElements('point');
        mapEdges.set({
            numEdges: numEdges,
            edges: edges.buffer,
            pointDegrees: pointDegrees.buffer,
            inputPoints: points.buffer,
            edgeWeights: edgeWeights.buffer,
            outputForcesMap: simulator.dataframe.getBuffer('outputEdgeForcesMap', 'simulator').buffer,
            isForward: isForward
        });
        segReduce.set({
            edgeStartEndIdxs: startEnd.buffer,
            input: simulator.dataframe.getBuffer('outputEdgeForcesMap', 'simulator').buffer,
            segStart: simulator.dataframe.getBuffer('segStart', 'simulator').buffer,
            numInput: numEdges,
            numOutput: numPoints,
            workList: workItems.buffer,
            output: outputForces.buffer,
            partialForces:partialForces.buffer,
            carryOutGlobal: simulator.dataframe.getBuffer('globalCarryOut', 'simulator').buffer
        })
        var resources = [edges, workItems, points, partialForces, outputForces];
        simulator.tickBuffers(
            simulator.dataframe.getBufferKeys('simulator').filter(function (name) {
                return simulator.dataframe.getBuffer(name, 'simulator') == outputForces;
            })
        );
        logger.trace("Running kernel faEdgeForces");
        var that = this;
        return mapEdges.exec([workItemsSize.edgeForces[0]], resources, [workItemsSize.edgeForces[1]]).then(function () {
            return segReduce.exec([workItemsSize.segReduce[0]], resources, [workItemsSize.segReduce[1]]);
        })
    }

    return edgeForcesOneWay(simulator, forwardsEdges, forwardsWorkItems, points, pointDegrees,
                                 simulator.dataframe.getBuffer('forwardsEdgeWeights', 'simulator'),
                                 simulator.dataframe.getBuffer('partialForces1', 'simulator'),
                                 simulator.dataframe.getBuffer('partialForces2', 'simulator'),
                                 simulator.dataframe.getBuffer('forwardsEdgeStartEndIdxs', 'simulator'),
                                 workItemsSize, 1)
    .then(function () {
        return edgeForcesOneWay(simulator, backwardsEdges, backwardsWorkItems, points,
                                     pointDegrees, simulator.dataframe.getBuffer('backwardsEdgeWeights', 'simulator'),
                                     simulator.dataframe.getBuffer('partialForces2', 'simulator'),
                                     simulator.dataframe.getBuffer('curForces', 'simulator'),
                                     simulator.dataframe.getBuffer('backwardsEdgeStartEndIdxs', 'simulator'),
                                     workItemsSize, 0);
        });
} 

function edgeForces(simulator, edgeKernelSeq, stepNumber, workItems) {
    var buffers = simulator.buffers;
    var dataframe = simulator.dataframe;

    return edgeKernelSeq.execKernels(simulator,
                                     dataframe.getBuffer('forwardsEdges', 'simulator'),
                                     dataframe.getBuffer('forwardsWorkItems', 'simulator'),
                                     dataframe.getBuffer('backwardsEdges', 'simulator'),
                                     dataframe.getBuffer('backwardsWorkItems', 'simulator'),
                                     dataframe.getBuffer('curPoints', 'simulator'),
                                     dataframe.getBuffer('degrees', 'simulator'),
                                     workItems);
}

ForceAtlas2Barnes.prototype.tick = function(simulator, stepNumber) {
    console.log("TICK layout", layoutBuffers);
    var locks = simulator.controls.locks;
    if (locks.lockPoints) {
        var buffers = simulator.buffers;
        simulator.tickBuffers(['curPoints', 'nextPoints']);
        return Q.all([]);

    }
    var that = this;
    var tickTime = Date.now();
    var workItems = getNumWorkitemsByHardware(simulator.cl.deviceProps);
    return that.pointForces(simulator, stepNumber, workItems)
    .then(function () {
        return that.edgeForces2(simulator,stepNumber, workItems);
    }).then(function () {
        return that.calculateSwings(simulator, workItems);
    }).then(function () {
        return that.integrate(simulator, layoutBuffers, workItems);
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

    var numWorkGroups = {
        toBarnesLayout: [30, 256],
        boundBox: [30, 256],
        buildTree: [30, 256],
        computeSums: [10, 256],
        sort: [16, 256],
        edgeForces: [100, 256],
        segReduce: [1000, 256],
        calculateForces: [60, 256]
    };

    if (deviceProps.NAME.indexOf('GeForce GT 650M') != -1 ||
        deviceProps.NAME.indexOf('GeForce GT 750M') != -1) {
        numWorkGroups.buildTree[0] = 1;
        numWorkGroups.computeSums[0] = 1;
    } else if (deviceProps.NAME.indexOf('Iris Pro') != -1) {
        numWorkGroups.computeSums[0] = 6;
        numWorkGroups.sort[0] = 8;
    } else if (deviceProps.NAME.indexOf('Iris') != -1) {
        numWorkGroups.computeSums[0] = 6;
        numWorkGroups.sort[0] = 8;
    } else if (deviceProps.NAME.indexOf('M290X') != -1) {
        numWorkGroups.buildTree[0] = 1;
        numWorkGroups.computeSums[0] = 1;
        numWorkGroups.computeSums[0] = 1; //6;
        numWorkGroups.sort[0] = 1; //8;
    } else if (deviceProps.NAME.indexOf('K520') != -1) {
        // 1024
        // 30:14.1, 36:14.3, 40:13.6, 46:14.5, 50:14.1, 60:14.1, 100:14.7,
        //
        // base 14.6% @ 200

        numWorkGroups.segReduce = [40, 1024];
        numWorkGroups.edgeForces = [200, 1024];

        // 1024
        // 6:35, 7:31, 8:27, 9:54, 10:50, 16:38, 20:52, 26:44
        // 30:41, 36:46
        //
        // 512
        // 2:92, 6:34, 7:29, 8:26, 9:44, 10:40, 14:31, 18:41, 24:35, 30:48
        numWorkGroups.buildTree = [8, 512];

        // 1024
        // 10:36, 14:27, 15:26, 16:24, 17:39, 18:38, 20:35, 26:28, 30:25, 36:30, 40:28, 46:25, 50:28, 60:25,
        // 70:26, 80:25, 100:26, 140:26, 200:26
        //
        // 512
        // 10:65, 20:35, 26:29, 28:27, 30:26, 34:39, 40:34
        numWorkGroups.calculateForces = [16, 1024];

        // 1024
        // 6:4, 8:4, 10:5,
        numWorkGroups.computeSums = [8, 1024];


    } else if (deviceProps.NAME.indexOf('HD Graphics 4000') != -1) {
        logger.debug('Expected slow kernels: sort, calculate_forces');
    }

    return _.mapObject(numWorkGroups, function(val, key) {
        val[0] = val[0] * val[1];
        return val;
    });
}

var computeSizes = function (simulator, warpsize, numPoints) {
    var blocks = 8; //TODO (paden) should be set to multiprocecessor count

    if (numPoints === undefined) {
        numPoints = simulator.dataframe.getNumElements('point');
    }
    var num_nodes = numPoints * 5;
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

var getWarpsize = function (vendor) {
    var warpsize = 1; // Always correct
    if (vendor.indexOf('intel') != -1) {
        warpsize = 16;
    } else if (vendor.indexOf('nvidia') != -1) {
        warpsize = 32;
    } else if (vendor.indexOf('amd') != -1) {
        warpsize = 64;
    }
    return warpsize;

}

module.exports = ForceAtlas2Barnes;

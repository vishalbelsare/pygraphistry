'use strict';

import Kernel from '../kernel/kernel.js';
import LayoutAlgo from '../layoutAlgo';

var _          = require('underscore'),
    Q          = require('q'),
    cljs       = require('../cl.js'),
    log         = require('@graphistry/common').logger,
    logger      = log.createLogger('graph-viz:cl:edgebundling');

var argsType = {
    THREADS_BOUND: cljs.types.define,
    THREADS_FORCES: cljs.types.define,
    THREADS_SUMS: cljs.types.define,
    WARPSIZE: cljs.types.define,
    blocked: null,
    bottom: null,
    charge: cljs.types.float_t,
    children: null,
    count: null,
    curForces: null,
    curMidPoints: null,
    edges: null,
    edgeDirectionX: null,
    edgeDirectionY: null,
    edgeLengths: null,
    edgeMaxs: null,
    edgeMins: null,
    globalSpeed: null,
    curPoints: null,
    mass: null,
    maxDepth: null,
    midpoint_stride: cljs.types.uint_t,
    midpoints_per_edge: cljs.types.uint_t,
    nextMidPoints: null,
    midPointForces: null,
    numEdges: cljs.types.uint_t,
    numSplits: cljs.types.uint_t,
    numNodes: cljs.types.uint_t,
    numWorkItems: cljs.types.uint_t,
    outputPositions: null,
    points: null,
    prevForces: null,
    radius: null,
    sort: null,
    springs: null,
    springStrength: cljs.types.float_t,
    springDistance: cljs.types.float_t,
    start: null,
    step: null,
    stepNumber: cljs.types.uint_t,
    swings: null,
    tau: cljs.types.float_t,
    tractions: null,
    xCoords: null,
    xmaxs: null,
    xmins: null,
    yCoords: null,
    workList: null,
    ymaxs: null,
    ymins: null
}

var kernelSpecs = {
    toKDLayout : {
        name: 'toKDLayout',
        kernelName:'to_kd_layout',
        args: ['numEdges', 'curMidPoints',
            'curPoints', 'xCoords', 'yCoords', 'springs', 'edgeDirectionX', 'edgeDirectionY',
            'edgeLengths', 'mass', 'blocked', 'maxDepth', 'stepNumber', 'midpoint_stride',
            'midpoints_per_edge', 'WARPSIZE', 'THREADS_BOUND', 'THREADS_FORCES', 'THREADS_SUMS'
        ],
        fileName: 'layouts/edgeBundling/kdTree/toKDLayout.cl'
    },
    boundBox: {
        name : 'boundBox',
        kernelName: 'bound_box',
        args : ['xCoords', 'yCoords', 'children', 'mass', 'start', 'xmins', 'xmaxs',
            'ymins', 'ymaxs', 'edgeMins', 'edgeMaxs', 'swings', 'tractions',
            'blocked', 'step', 'bottom', 'radius', 'globalSpeed', 'stepNumber',
            'numEdges', 'numNodes', 'tau', 'THREADS_BOUND'],
            fileName: 'layouts/edgeBundling/kdTree/boundBox.cl'
    },
    buildTree: {
        name: 'buildTree',
        kernelName: 'build_tree',
        args: [ 'xCoords', 'yCoords', 'children', 'mass', 'start', 'step', 'bottom', 'maxDepth',
            'radius', 'stepNumber', 'numEdges', 'numNodes' ],
        fileName: 'layouts/edgeBundling/kdTree/buildTree.cl'
    },
    computeSums: {
        name: 'computeSums',
        kernelName: 'compute_sums',
        args: [ 'xCoords', 'yCoords', 'children', 'mass', 'count', 'step', 'bottom',
            'stepNumber', 'numEdges', 'numNodes', 'WARPSIZE', 'THREADS_SUMS'
        ],
        fileName: 'layouts/edgeBundling/kdTree/computeSums.cl'
    },
    sort: {
        name: 'sort',
        kernelName: 'sort',
        args: [ 'xCoords', 'yCoords', 'children', 'start', 'sort', 'count', 'step', 'bottom',
            'maxDepth', 'radius', 'globalSpeed', 'stepNumber',  'numEdges', 'numNodes', ],
            fileName: 'layouts/edgeBundling/kdTree/sort.cl'
    },
    calculateMidPoints: {
        name: 'calculateMidPoints',
        kernelName: 'calculate_forces',
        args:[
            'xCoords', 'yCoords', 'edgeDirectionX', 'edgeDirectionY', 'edgeLengths', 'children', 'sort',
            'blocked', 'maxDepth', 'radius', 'stepNumber', 'numEdges', 'numNodes', 'midPointForces',
            'charge', 'midpoint_stride', 'midpoints_per_edge', 'WARPSIZE', 'THREADS_FORCES'
        ],
        fileName: 'layouts/edgeBundling/kdTree/calculateForces.cl'
    },
    midspringForces: {
        name: 'midspringForces',
        kernelName: 'midspringForces',
        args: ['numSplits', 'springs', 'workList', 'curPoints', 'midPointForces', 'curMidPoints',
            'curForces', 'springStrength', 'springDistance', 'stepNumber'],
        fileName: 'layouts/edgeBundling/midspringForces.cl'
    },
    faSwingsKernel : {
        name: 'faSwingsKernel',
        kernelName: 'faSwingsTractions',
        args: ['prevForces', 'curForces', 'swings', 'tractions'],
        fileName: 'layouts/edgeBundling/faSwingsTractions.cl'
    },
    integrateMidpoints: {
        name: 'integrateMidpoints',
        kernelName: 'faIntegrate',
        args: ['globalSpeed', 'curMidPoints', 'curForces', 'swings', 'nextMidPoints'],
        fileName: 'layouts/edgeBundling/faIntegrateMidPoints.cl'
    },
    interpolateMidpoints: {
        name: 'interpolateMidpoints',
        kernelName: 'interpolateMidpoints',
        args: ['edges', 'points', 'numEdges', 'numSplits', 'curMidPoints'],
        fileName: 'layouts/edgeBundling/interpolateMidpoints.cl',
    }
}

function EdgeBundling(clContext) {
    LayoutAlgo.call(this, 'EdgeBundling');

    logger.debug('Creating edge bundling kernels');

    var that = this;
    // Create the kernels described by kernel specifications
    _.each( kernelSpecs, function (kernel) {
        var newKernel =
            new Kernel(kernel.kernelName, kernel.args, argsType, kernel.fileName, clContext)
        that[kernel.name] = newKernel;
        that.kernels.push(newKernel);
    });
}

EdgeBundling.prototype = Object.create(LayoutAlgo.prototype);
EdgeBundling.prototype.constructor = EdgeBundling;

EdgeBundling.algoName = 'EdgeBundling';

// Contains any temporary buffers needed for layout
var layoutBuffers  = {};

// Create temporary buffers needed for layout
var initializeLayoutBuffers = function (simulator) {

    var numMidPoints = simulator.dataframe.getNumElements('midPoints');
    var getBufferSizes = function(simulator) {
        var warpsize = getWarpsize(simulator);
        // TODO Set this to the number of workgroups in boundBox kernel
        var numNodes = getNumNodes(numMidPoints, warpsize);
        var numWorkGroups = 30;
        var numDimensions = 2;
        return {
            blocked : Int32Array.BYTES_PER_ELEMENT,
            bottom : Int32Array.BYTES_PER_ELEMENT,
            children : 4*(numNodes + 1)*Int32Array.BYTES_PER_ELEMENT,
            count : (numNodes + 1)*Int32Array.BYTES_PER_ELEMENT,
            curForces: 2 * numMidPoints * Float32Array.BYTES_PER_ELEMENT,
            edgeDirectionX : (numNodes + 1) * Float32Array.BYTES_PER_ELEMENT,
            edgeDirectionY : (numNodes + 1) * Float32Array.BYTES_PER_ELEMENT,
            edgeLengths : (numNodes + 1) * Float32Array.BYTES_PER_ELEMENT,
            edgeMaxs : (numWorkGroups)*Float32Array.BYTES_PER_ELEMENT,
            edgeMins : (numWorkGroups)*Float32Array.BYTES_PER_ELEMENT,
            globalSpeed : Float32Array.BYTES_PER_ELEMENT,
            mass : (numNodes + 1) * Float32Array.BYTES_PER_ELEMENT,
            maxDepth : Int32Array.BYTES_PER_ELEMENT,
            prevForces: 2 * numMidPoints * Float32Array.BYTES_PER_ELEMENT,
            radius : numDimensions * Float32Array.BYTES_PER_ELEMENT,
            sort : (numNodes + 1)*Int32Array.BYTES_PER_ELEMENT,
            start: (numNodes + 1)*Int32Array.BYTES_PER_ELEMENT,
            step : Int32Array.BYTES_PER_ELEMENT,
            swings: numMidPoints * Float32Array.BYTES_PER_ELEMENT,
            midPointForces: 2 * numMidPoints * Float32Array.BYTES_PER_ELEMENT,
            tractions: numMidPoints * Float32Array.BYTES_PER_ELEMENT,
            xCoords : (numNodes + 1) * Float32Array.BYTES_PER_ELEMENT,
            xmaxs : (numWorkGroups)*Float32Array.BYTES_PER_ELEMENT,
            xmins : (numWorkGroups)*Float32Array.BYTES_PER_ELEMENT,
            yCoords : (numNodes + 1) * Float32Array.BYTES_PER_ELEMENT,
            ymaxs :  (numWorkGroups)*Float32Array.BYTES_PER_ELEMENT,
            ymins : (numWorkGroups)*Float32Array.BYTES_PER_ELEMENT,
        }
    }

    var bufferSizes = getBufferSizes(simulator);
    var memoryAllocationPromises = _.map(bufferSizes, function (value, key) {
        return simulator.cl.createBuffer(value, key);
    })
    return Q.all(memoryAllocationPromises)

    .then(function (buffers) {
        _.each(_.keys(bufferSizes), function (value, index) {
            layoutBuffers[value] = buffers[index];
        });
        return layoutBuffers
    })
    .then(function (layoutBuffers) {
        var swingZeros = new Float32Array(numMidPoints);
        var tractionOnes = new Float32Array(numMidPoints);
        for (var i = 0; i < swingZeros.length; i++) {
            swingZeros[i] = 0;
            tractionOnes[i] = 1;
        }
        var prevForcesZeros = new Float32Array(numMidPoints * 2);
        for (var i = 0; i < prevForcesZeros.length; i++) {
            prevForcesZeros[i] = 0;
        }
        return Q.all([
            layoutBuffers.swings.write(swingZeros),
            layoutBuffers.tractions.write(tractionOnes),
            layoutBuffers.prevForces.write(prevForcesZeros)
        ])
        .then(function (){
        return layoutBuffers;
        })
    })

    .fail(log.makeQErrorHandler(logger, "Initializing layout buffers need for edge bundling failed"));
};

var getBufferBindings = function (simulator, layoutBuffers) {
    var warpsize = getWarpsize(simulator);
    var workGroupSize = 256;
    var workItems = getNumWorkitemsByHardware(simulator.cl.deviceProps, workGroupSize);
    var numBodies = simulator.dataframe.getNumElements('edge');
    var numNodes = getNumNodes(numBodies, warpsize);
    return {
        THREADS_BOUND: workItems.boundBox[1],
        THREADS_FORCES: workItems.calculateForces[1],
        THREADS_SUMS: workItems.computeSums[1],
        WARPSIZE:warpsize,
        blocked:layoutBuffers.blocked.buffer,
        bottom:layoutBuffers.bottom.buffer,
        children:layoutBuffers.children.buffer,
        count:layoutBuffers.count.buffer,
        curForces: layoutBuffers.curForces.buffer,
        edges: simulator.dataframe.getBuffer('forwardsEdges', 'simulator').buffer,
        edgeDirectionX: layoutBuffers.edgeDirectionX.buffer,
        edgeDirectionY: layoutBuffers.edgeDirectionY.buffer,
        edgeLengths: layoutBuffers.edgeLengths.buffer,
        edgeMaxs:layoutBuffers.edgeMaxs.buffer,
        edgeMins:layoutBuffers.edgeMins.buffer,
        globalSpeed: layoutBuffers.globalSpeed.buffer,
        curPoints: simulator.dataframe.getBuffer('curPoints', 'simulator').buffer,
        mass: layoutBuffers.mass.buffer,
        maxDepth:layoutBuffers.maxDepth.buffer,
        midPointForces:layoutBuffers.midPointForces.buffer,
        numEdges: simulator.dataframe.getNumElements('edge'),
        numNodes:numNodes,
        numSplits: simulator.controls.global.numSplits,
        radius:layoutBuffers.radius.buffer,
        nextMidPoints: simulator.dataframe.getBuffer('nextMidPoints', 'simulator').buffer,
        curMidPoints: simulator.dataframe.getBuffer('curMidPoints', 'simulator').buffer,
        points: simulator.dataframe.getBuffer('curPoints', 'simulator').buffer,
        prevForces: layoutBuffers.prevForces.buffer,
        sort:layoutBuffers.sort.buffer,
        springs: simulator.dataframe.getBuffer('forwardsEdges', 'simulator').buffer,
        start:layoutBuffers.start.buffer,
        step:layoutBuffers.step.buffer,
        swings:layoutBuffers.swings.buffer,
        tractions:layoutBuffers.tractions.buffer,
        xCoords: layoutBuffers.xCoords.buffer,
        xmaxs:layoutBuffers.xmaxs.buffer,
        xmins:layoutBuffers.xmins.buffer,
        yCoords:layoutBuffers.yCoords.buffer,
        ymaxs:layoutBuffers.ymaxs.buffer,
        ymins:layoutBuffers.ymins.buffer,
        workList: simulator.dataframe.getBuffer('forwardsWorkItems', 'simulator').buffer,
    }
};

EdgeBundling.prototype.setEdges = function (simulator) {
    var that = this;
    return initializeLayoutBuffers(simulator).then(function (tempLayoutBuffers) {
        var bufferBindings = getBufferBindings(simulator, tempLayoutBuffers);
        _.each(that.kernels, function(kernel) {
            kernel.set(_.pick(bufferBindings, kernel.argNames))
        });
    })
    .fail( log.makeQErrorHandler(logger, 'Failure in kd-edgebundling.js setEdges') )
};

EdgeBundling.prototype.midEdgeForces =  function(simulator, workItems) {
    var numForwardsWorkItems = simulator.dataframe.getNumElements('forwardsWorkItems');
    var resources = [
        simulator.dataframe.getBuffer('forwardsEdges', 'simulator'),
        simulator.dataframe.getBuffer('forwardsWorkItems', 'simulator'),
        simulator.dataframe.getBuffer('curPoints', 'simulator'),
        simulator.dataframe.getBuffer('nextMidPoints', 'simulator'),
        simulator.dataframe.getBuffer('curMidPoints', 'simulator'),
    ];

    logger.debug('Running kernel gaussSeidelMidsprings');
    return this.midspringForces.exec([numForwardsWorkItems], resources);
}

EdgeBundling.prototype.calculateSwings = function(simulator, workItems) {
    var numMidpoints = simulator.dataframe.getNumElements('midPoints');
    var resources = [];
    return this.faSwingsKernel.exec([numMidpoints], resources)
    .fail(log.makeQErrorHandler(logger, 'Executing FaSwing failed'));
};


EdgeBundling.prototype.interpolate = function(simulator) {
    var numSprings = simulator.dataframe.getNumElements('edge');
    var resources = [
        simulator.dataframe.getBuffer('forwardsEdges', 'simulator')
    ];

    logger.trace('Running interpolateMidpoints kernel');
    return this.interpolateMidpoints.exec([numSprings], resources)
    .fail(log.makeQErrorHandler(logger, 'Kernel interpolateMidPoints failed'));
};

EdgeBundling.prototype.integrate = function(simulator, workItems) {
    var numMidPoints = simulator.dataframe.getNumElements('midPoints');

    var resources = [
        simulator.dataframe.getBuffer('curMidPoints', 'simulator'),
        simulator.dataframe.getBuffer('curForces', 'simulator'),
        simulator.dataframe.getBuffer('swings', 'simulator'),
        simulator.dataframe.getBuffer('nextMidPoints', 'simulator')
    ];

    logger.trace("Running kernel faIntegrate");
    return this.integrateMidpoints.exec([numMidPoints], resources)
    .fail(log.makeQErrorHandler(logger, 'Executing Integrate failed'));
}

// Calculate the attractive point forces on all midpoints
EdgeBundling.prototype.calculateMidPointForces = function(simulator, workItems) {
    // Helper function in order to create a chain of promises. It is needed in order to
    // dynamically create a promise chain for a variable number of midpoints.
    function promiseWhile(condition, body) {
        var done = Q.defer();

        function loop() {
            if (!condition()) {
                return done.resolve();
            }
            Q.when(body(), loop, done.reject);
        }

        Q.nextTick(loop);
        return done.promise;
    }

    var that = this;
    simulator.tickBuffers(['curMidPoints']);
    var calculateMidPointForces =  new Q().then(function () {
        // Promise while loop to calculate each set of midpoints seperately.
        var midpointIndex = 0;
        var condition = function () {
            return midpointIndex < simulator.dataframe.getNumElements('splits');
        };

        var body = function () {
            return that.calculateMidPointForcesOnIndex(simulator, workItems, midpointIndex)
                .then(function () {
                    midpointIndex = midpointIndex + 1;
                });
        };

        return promiseWhile(condition, body);

    })
    return calculateMidPointForces;
}

// Calculate the point forces on midpoints with index equal to midpointIndex
EdgeBundling.prototype.calculateMidPointForcesOnIndex = function(simulator, workItems, midpointIndex) {
    var numSplits = simulator.dataframe.getNumElements('splits');

    var resources = [
        simulator.dataframe.getBuffer('curMidPoints', 'simulator'),
        simulator.dataframe.getBuffer('forwardsDegrees', 'simulator'),
        simulator.dataframe.getBuffer('backwardsDegrees', 'simulator'),
        simulator.dataframe.getBuffer('nextMidPoints', 'simulator')
    ];

    this.toKDLayout.set({midpoint_stride: midpointIndex, midpoints_per_edge: numSplits});
    this.calculateMidPoints.set({midpoint_stride: midpointIndex, midpoints_per_edge: numSplits});

    simulator.tickBuffers(['nextMidPoints']);

    logger.debug("Running Edge Bundling with kd-tree Kernel Sequence");

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
    .fail(log.makeQErrorHandler(logger, "Executing kd-tree edge bundling failed"));
};

EdgeBundling.prototype.tick = function (simulator, stepNumber) {
    var workGroupSize = 256;
    var workItems = getNumWorkitemsByHardware(simulator.cl.deviceProps, workGroupSize);
    var that = this;
    var locks = simulator.controls.locks;
    var calculateMidPoints;

    // Set the step number for the kernels that have it as an arguement
    _.each(_.filter(this.kernels, function(x) { return x.argNames.indexOf('stepNumber') > 0}), function(kernel) {
        kernel.set({stepNumber: stepNumber});
    });

    if (locks.lockMidpoints && locks.lockMidedges) {
        logger.debug('LOCKED, EARLY EXIT');
        return new Q();
    }

    if (locks.lockMidpoints) {
        simulator.tickBuffers['curMidPoints'];
        var curMidPoints = simulator.dataframe.getBuffer('curMidPoints', 'simulator');
        var nextMidPoints = simulator.dataframe.getBuffer('nextMidPoints', 'simulator');
        return curMidPoints.copyInto(nextMidPoints);
    }

    if (locks.interpolateMidPointsOnce || locks.interpolateMidPoints) {
        if ( locks.interpolateMidpointsOnce ) {
            logger.debug("Force interpolation of midpoints");
        }
        locks.interpolateMidPointsOnce = false;
        // If interpolateMidpoints is true, midpoints are calculate by interpolating between
        // corresponding edge points.
        simulator.tickBuffers(['curMidPoints']);
        calculateMidPoints = Q().then(function () {
            return that.interpolate(simulator);
        });
    } else {
      // If interpolateMidpoints is not true, calculate midpoints by edge bundling algorithm.
        simulator.tickBuffers(['curMidPoints']);

        return calculateMidPoints = Q().then(function () {
            return that.calculateMidPointForces(simulator, workItems)
        })
        .then(function () { //TODO do both forwards and backwards?
            if (simulator.dataframe.getNumElements('edge') > 0 && !locks.lockMidedges) {
                return that.midEdgeForces(simulator, workItems);
            }
        })

        .then(function () {
            return that.calculateSwings(simulator, workItems);
        })

        .then(function () {
            return that.integrate(simulator, workItems);
        })

        .then(function () {
            var nextMidPoints = simulator.dataframe.getBuffer('nextMidPoints', 'simulator');
            var curMidPoints = simulator.dataframe.getBuffer('curMidPoints', 'simulator');
            return nextMidPoints.copyInto(curMidPoints);
        });
    }
    return calculateMidPoints.then(function () {
    }).then(function () {
        return Q.all([
            layoutBuffers.curForces.copyInto(layoutBuffers.prevForces)
        ]);
    }).fail(log.makeQErrorHandler(logger, 'Failure in edgebundling tick'));
};

var getNumNodes = function(numBodies, warpsize) {
    // Adjust sizes for optimized memory
    var blocks = 8; //TODO (paden) should be set to multiprocecessor count
    var numNodes = numBodies * 5;
    if (numNodes < 1024*blocks) {
        numNodes = 1024*blocks;
    }
    while ((numNodes & (warpsize - 1)) != 0) {
        numNodes++;
    }
    return numNodes;
};

var getWarpsize = function(simulator) {
    var vendor = simulator.cl.deviceProps.VENDOR.toLowerCase();
    var warpsize = 1; // Always correct
    if (vendor.indexOf('intel') !== -1) {
        warpsize = 16;
    } else if (vendor.indexOf('nvidia') !== -1) {
        warpsize = 32;
    } else if (vendor.indexOf('amd') !== -1) {
        warpsize = 64;
    }
    return warpsize;
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

    if (deviceProps.NAME.indexOf('GeForce GT 650M') !== -1) {
        numWorkGroups.buildTree[0] = 1;
        numWorkGroups.computeSums[0] = 1;
    } else if (deviceProps.NAME.indexOf('Iris Pro') !== -1) {
        numWorkGroups.computeSums[0] = 6;
        numWorkGroups.sort[0] = 8;
    } else if (deviceProps.NAME.indexOf('Iris') !== -1) {
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


    } else if (deviceProps.NAME.indexOf('HD Graphics 4000') !== -1) {
        log.warn('Expected slow kernels: sort, calculate_forces');
    }

    return _.mapObject(numWorkGroups, function (val) {
        val[0] = val[0] * val[1];
        return val;
    });
}


export default EdgeBundling;

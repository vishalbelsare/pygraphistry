'use strict';
var _          = require('underscore'),
    Q          = require('q'),
    cljs       = require('../../../cl.js'),
    Kernel     = require('../../../kernel.js'),
    LayoutAlgo = require('../../../layoutAlgo.js'),
    MidpointForces = require('./midpointForces.js')


var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz:cl:edgebundling');

var argsType = {
    THREADS_BOUND: cljs.types.define,
    THREADS_FORCES: cljs.types.define,
    THREADS_SUMS: cljs.types.define,
    WARPSIZE: cljs.types.define,
    accX: null,
    accY: null,
    blocked: null,
    bottom: null,
    charge: cljs.types.float_t,
    children: null,
    count: null,
    curForces: null,
    edges: null,
    edgeDirectionX: null,
    edgeDirectionY: null,
    edgeLengths: null,
    edgeMaxs: null,
    edgeMins: null,
    gSpeed: cljs.types.float_t,
    gSpeeds: null,
    globalSpeed: null,
    inputForces: null,
    inputMidpoints: null,
    inputMidPositions: null,
    inputPoints: null,
    inputPositions: null,
    mass: null,
    maxDepth: null,
    midpoint_stride: cljs.types.uint_t,
    midpoints_per_edge: cljs.types.uint_t,
    midSpringsColorCoords: null,
    nextMidPoints: null,
    numBodies: cljs.types.uint_t,
    numEdges: cljs.types.uint_t,
    numSplits: cljs.types.uint_t,
    numNodes: cljs.types.uint_t,
    numPoints: cljs.types.uint_t,
    numWorkItems: cljs.types.uint_t,
    outputPositions: null,
    outputMidPoints: null,
    outputMidpoints: null,
    points: null,
    prevForces: null,
    radius: null,
    sort: null,
    springs: null,
    springMidPositions: null,
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
        args: ['numPoints', 'inputMidPositions',
            'inputPositions', 'xCoords', 'yCoords', 'springs', 'edgeDirectionX', 'edgeDirectionY',
            'edgeLengths', 'mass', 'blocked', 'maxDepth', 'stepNumber', 'midpoint_stride',
            'midpoints_per_edge', 'WARPSIZE', 'THREADS_BOUND', 'THREADS_FORCES', 'THREADS_SUMS'
        ],
        fileName: 'layouts/gpu/edgeBundling/kdTree/toKDLayout.cl'
    },
    boundBox: {
        name : 'boundBox',
        kernelName: 'bound_box',
        args : ['xCoords', 'yCoords', 'children', 'mass', 'start', 'xmins', 'xmaxs',
            'ymins', 'ymaxs', 'edgeMins', 'edgeMaxs', 'swings', 'tractions',
            'blocked', 'step', 'bottom', 'radius', 'globalSpeed', 'stepNumber',
            'numBodies', 'numNodes', 'tau', 'THREADS_BOUND'],
            fileName: 'layouts/gpu/edgeBundling/kdTree/boundBox.cl'
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
        fileName: 'layouts/gpu/edgeBundling/kdTree/buildTree.cl'
    },
    computeSums: {
        name: 'computeSums',
        kernelName: 'compute_sums',
        args: [ 'xCoords', 'yCoords', 'children', 'mass', 'count', 'step', 'bottom',
            'stepNumber', 'numBodies', 'numNodes', 'WARPSIZE', 'THREADS_SUMS'
        ],
        fileName: 'layouts/gpu/edgeBundling/kdTree/computeSums.cl'
    },
    sort: {
        name: 'sort',
        kernelName: 'sort',
        args: [ 'xCoords', 'yCoords', 'children', 'start', 'sort', 'count', 'step', 'bottom',
            'maxDepth', 'radius', 'globalSpeed', 'stepNumber',  'numBodies', 'numNodes', ],
            fileName: 'layouts/gpu/edgeBundling/kdTree/sort.cl'
    },
    calculateMidPoints: {
        name: 'calculateMidPoints',
        kernelName: 'calculate_forces',
        args:[
            'xCoords', 'yCoords', 'edgeDirectionX', 'edgeDirectionY', 'edgeLengths', 'children', 'sort',
            'blocked', 'maxDepth', 'radius', 'stepNumber', 'numBodies', 'numNodes', 'nextMidPoints',
            'charge', 'midpoint_stride', 'midpoints_per_edge', 'WARPSIZE', 'THREADS_FORCES'
        ],
        fileName: 'layouts/gpu/edgeBundling/kdTree/calculateForces.cl'
    },
    faSwingsKernel : {
        name: 'faSwingsKernel',
        kernelName: 'faSwingsTractions',
        args: ['prevForces', 'curForces', 'swings', 'tractions'],
        fileName: 'layouts/gpu/edgeBundling/faSwingsTractions.cl'
    },
    integrateMidpoints: {
        name: 'integrateMidpoints',
        kernelName: 'faIntegrate',
        args: ['globalSpeed', 'inputPositions', 'curForces', 'swings', 'outputPositions'],
        fileName: 'layouts/gpu/edgeBundling/faIntegrateMidPoints.cl'
    },
    interpolateMidpoints: {
        name: 'interpolateMidpoints',
        kernelName: 'interpolateMidpoints',
        args: ['edges', 'points', 'numEdges', 'numSplits', 'outputMidPoints'],
        fileName: 'layouts/gpu/edgeBundling/interpolateMidpoints.cl',
    },
    midspringForces: {
        name: 'midspringForces',
        kernelName: 'midspringForces',
        args: ['numSplits', 'springs', 'workList', 'inputPoints', 'inputForces', 'inputMidpoints', 
            'outputMidpoints', 'springMidPositions', 'midSpringsColorCoords', 'springStrength', 
            'springDistance', 'stepNumber'],
        fileName: 'layouts/gpu/edgeBundling/midspringForces.cl'
    }

}


function EdgeBundling(clContext) {
    LayoutAlgo.call(this, EdgeBundling.name);

    logger.debug('Creating edge bundling kernels');
    this.midpointForces= new MidpointForces(clContext);


    var that = this;
    // Create the kernels described by kernel specifications
    _.each( kernelSpecs, function (kernel) {
        var newKernel =
            new Kernel(kernel.kernelName, kernel.args, argsType, kernel.fileName, clContext)
        that[kernel.name] = newKernel;
        that.kernels.push(newKernel);
    });

    this.kernels = this.midpointForces.kernels.concat([this.midspringForces, this.integrateMidpoints,
                                                      this.interpolateMidpoints]);
}

EdgeBundling.prototype = Object.create(LayoutAlgo.prototype);
EdgeBundling.prototype.constructor = EdgeBundling;

EdgeBundling.name = 'EdgeBundling';

// Contains any temporary buffers needed for layout
var tempLayoutBuffers  = {
    globalSpeed: null,
    tempMidPoints: null,
    prevForces: null,
    curForces: null,
    swings: null,
    tractions: null
};
Object.seal(tempLayoutBuffers);

// Create temporary buffers needed for layout
var setupTempLayoutBuffers = function (simulator) {
    var numMidPoints = simulator.dataframe.getNumElements('midPoints');
    simulator.resetBuffers(tempLayoutBuffers);
    return Q.all([
        simulator.cl.createBuffer(Float32Array.BYTES_PER_ELEMENT, 'global_speed'),
        simulator.cl.createBuffer(2 * numMidPoints * Float32Array.BYTES_PER_ELEMENT, 'prevForces'),
        simulator.cl.createBuffer(2 * numMidPoints * Float32Array.BYTES_PER_ELEMENT, 'curForces'),
        simulator.cl.createBuffer(2 * numMidPoints * Float32Array.BYTES_PER_ELEMENT, 'tempMidPoints'),
        simulator.cl.createBuffer(1 * numMidPoints * Float32Array.BYTES_PER_ELEMENT, 'swings'),
        simulator.cl.createBuffer(1 * numMidPoints * Float32Array.BYTES_PER_ELEMENT, 'tractions')
    ]).spread(function (globalSpeed, prevForces, curForces, tempMidPoints, swings, tractions) {
        tempLayoutBuffers.globalSpeed = globalSpeed;
        tempLayoutBuffers.prevForces = prevForces;
        tempLayoutBuffers.curForces = curForces;
        tempLayoutBuffers.tempMidPoints = tempMidPoints;
        tempLayoutBuffers.swings = swings;
        tempLayoutBuffers.tractions = tractions;
        return tempLayoutBuffers;
    }).catch(log.makeQErrorHandler(logger, 'setupTempBuffers'));
};


EdgeBundling.prototype.setEdges = function (simulator) {
    var vendor,
        warpsize,
        global,
        that,
        workGroupSize,
        workItems;

    vendor = simulator.cl.deviceProps.VENDOR.toLowerCase();
    warpsize = 1; // Always correct
    if (vendor.indexOf('intel') !== -1) {
        warpsize = 16;
    } else if (vendor.indexOf('nvidia') !== -1) {
        warpsize = 32;
    } else if (vendor.indexOf('amd') !== -1) {
        warpsize = 64;
    }

    global = simulator.controls.global;
    that = this;
    workGroupSize = 256;
    workItems = getNumWorkitemsByHardware(simulator.cl.deviceProps, workGroupSize);

    return setupTempLayoutBuffers(simulator).then(function (tempLayoutBuffers) {
        that.midpointForces.setMidPoints(simulator, tempLayoutBuffers, warpsize, workItems);
        that.faSwingsKernel.set({
            prevForces: tempLayoutBuffers.prevForces.buffer,
            curForces: tempLayoutBuffers.curForces.buffer,
            swings: tempLayoutBuffers.swings.buffer,
            tractions: tempLayoutBuffers.tractions.buffer
          })

        that.midspringForces.set({
            numSplits: global.numSplits,
            springs: simulator.dataframe.getBuffer('forwardsEdges', 'simulator').buffer,
            workList: simulator.dataframe.getBuffer('forwardsWorkItems', 'simulator').buffer,
            inputPoints: simulator.dataframe.getBuffer('curPoints', 'simulator').buffer,
            inputForces: tempLayoutBuffers.tempMidPoints.buffer,
            inputMidpoints: simulator.dataframe.getBuffer('curMidPoints', 'simulator').buffer,
            outputMidpoints: tempLayoutBuffers.curForces.buffer,
            springMidPositions: simulator.dataframe.getBuffer('midSpringsPos', 'simulator').buffer,
            midSpringsColorCoords: simulator.dataframe.getBuffer('midSpringsColorCoord', 'simulator').buffer
        });
    })
    .fail( log.makeQErrorHandler(logger, 'Failure in kd-edgebundling.js setEdges') )
};

// TODO Should we do forwards and backwards edges?
function midEdges(simulator, ebMidsprings, stepNumber) {
    var numForwardsWorkItems = simulator.dataframe.getNumElements('forwardsWorkItems');
    var resources = [
        simulator.dataframe.getBuffer('forwardsEdges', 'simulator'),
        simulator.dataframe.getBuffer('forwardsWorkItems', 'simulator'),
        simulator.dataframe.getBuffer('curPoints', 'simulator'),
        simulator.dataframe.getBuffer('nextMidPoints', 'simulator'),
        simulator.dataframe.getBuffer('curMidPoints', 'simulator'),
        simulator.dataframe.getBuffer('midSpringsPos', 'simulator'),
        simulator.dataframe.getBuffer('midSpringsColorCoord', 'simulator')
    ];

    ebMidsprings.set({stepNumber: stepNumber});

    logger.debug('Running kernel gaussSeidelMidsprings');
    return ebMidsprings.exec([numForwardsWorkItems], resources);
}

EdgeBundling.prototype.calculateSwings = function(simulator, workItems) {
    var numMidpoints = simulator.dataframe.getNumElements('midPoints');
    var resources = [];
    return this.faSwingsKernel.exec([numMidpoints], resources)
    .fail(log.makeQErrorHandler(logger, 'Executing FaSwing failed'));
};


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

EdgeBundling.prototype.interpolate = function(simulator) {
    var buffers = simulator.buffers,
        numSprings = simulator.dataframe.getNumElements('edge'),
        numSplits = simulator.dataframe.getNumElements('splits'),
        resources = [
        simulator.dataframe.getBuffer('forwardsEdges', 'simulator')
    ];

    this.interpolateMidpoints.set({
        edges: simulator.dataframe.getBuffer('forwardsEdges', 'simulator').buffer,
        points: simulator.dataframe.getBuffer('curPoints', 'simulator').buffer,
        numEdges: numSprings,
        numSplits: numSplits,
        outputMidPoints: simulator.dataframe.getBuffer('curMidPoints', 'simulator').buffer
    });

    simulator.tickBuffers(['nextMidPoints']);

    logger.trace('Running interpolateMidpoints kernel');
    return this.interpolateMidpoints.exec([numSprings], resources)
    .fail(log.makeQErrorHandler(logger, 'Kernel interpolateMidPoints failed'));
};

EdgeBundling.prototype.integrate = function(simulator, tempLayoutBuffers) {
    var buffers = simulator.buffers;
    var numMidPoints = simulator.dataframe.getNumElements('midPoints');

    this.integrateMidpoints.set({
        globalSpeed: tempLayoutBuffers.globalSpeed.buffer,
        inputPositions: simulator.dataframe.getBuffer('curMidPoints', 'simulator').buffer,
        curForces: tempLayoutBuffers.curForces.buffer,
        swings: tempLayoutBuffers.swings.buffer,
        outputPositions: simulator.dataframe.getBuffer('nextMidPoints', 'simulator').buffer
    });

    var resources = [
        simulator.dataframe.getBuffer('curMidPoints', 'simulator'),
        simulator.dataframe.getBuffer('curForces', 'simulator'),
        simulator.dataframe.getBuffer('swings', 'simulator'),
        simulator.dataframe.getBuffer('nextMidPoints', 'simulator')
    ];

    simulator.tickBuffers(['nextPoints']);

    logger.trace("Running kernel faIntegrate");
    return this.integrateMidpoints.exec([numMidPoints], resources)
    .fail(log.makeQErrorHandler(logger, 'Executing Integrate failed'));
}


EdgeBundling.prototype.tick = function (simulator, stepNumber) {

    var workGroupSize,
        workItems,
        that,
        locks,
        calculateMidpoints;

    workGroupSize = 256;
    workItems = getNumWorkitemsByHardware(simulator.cl.deviceProps, workGroupSize);
    that = this;
    var locks = simulator.controls.locks;
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
        // If interpolateMidpoints is true, midpoints are calculate by
        // interpolating between corresponding edge points.
        simulator.tickBuffers(['curMidPoints']);
        calculateMidpoints = new Q().then(function () {
            return that.interpolate(simulator)
        });
    } else {
      // If interpolateMidpoints is not true, calculate midpoints
      // by edge bundling algorithm.
        simulator.tickBuffers(['curMidPoints']);
        calculateMidpoints =  new Q().then(function () {
            var midpointIndex,
                condition,
                body;

            // Promise while loop to calculate each set of midpoints seperately.
            midpointIndex = 0;
            condition = function () {
                return midpointIndex < simulator.dataframe.getNumElements('splits');
            };

            body = function () {
                return that.midpointForces.execKernels(simulator, stepNumber, workItems, midpointIndex)
                    .then(function () {
                        midpointIndex = midpointIndex + 1;
                    });
            };

            return promiseWhile(condition, body);

        }).then(function () { //TODO do both forwards and backwards?
            if (simulator.dataframe.getNumElements('edge') > 0 && !locks.lockMidedges) {
                return midEdges(simulator, that.midspringForces, stepNumber);
            }

            //simulator.tickBuffers(['curMidpoints']);
            //return simulator.buffers.nextMidpoints.copyInto(simulator.buffers.curMidpoints);
        }).then(function () {
            return that.calculateSwings(simulator, workItems);
        }).then(function () {
            return that.integrate(simulator, tempLayoutBuffers, workItems);
        }).then(function () {
            var nextMidPoints = simulator.dataframe.getBuffer('nextMidPoints', 'simulator');
            var curMidPoints = simulator.dataframe.getBuffer('curMidPoints', 'simulator');

            return nextMidPoints.copyInto(curMidPoints);
        });
    }
    return calculateMidpoints.then(function () {
    }).then(function () {
        return Q.all([
            //tempLayoutBuffers.curForces.copyInto(tempLayoutBuffers.prevForces)
            tempLayoutBuffers.curForces.copyInto(tempLayoutBuffers.prevForces)
        ]);
    }).fail(log.makeQErrorHandler(logger, 'Failure in edgebundling tick'));
};

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


module.exports = EdgeBundling;

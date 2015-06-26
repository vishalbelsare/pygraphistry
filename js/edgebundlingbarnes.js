'use strict';
var _          = require('underscore'),
    Q          = require('q'),
    cljs       = require('./cl.js'),
    webcl      = require('node-webcl'),
    Kernel     = require('./kernel.js'),
    LayoutAlgo = require('./layoutAlgo.js'),
    FaSwingsKernel = require('./javascript_kernels/faSwingsKernel.js'),
    IntegrateMidPointsKernel = require('./javascript_kernels/integrateMidPointsKernel.js'),
    InterpolateMidPoints = require('./javascript_kernels/interpolateMidpoints.js'),
    //integrateKernel = require('./javascript_kernels/integrateKernel.js'),
    EbBarnesKernelSeq = require('./javascript_kernels/ebBarnesKernelSeq.js'),
    MidEdgeGather = require('./javascript_kernels/midEdgeGather.js'),
    Log        = require('common/logger.js'),
    logger     = Log.createLogger('graph-viz:cl:edgebundling');


function EdgeBundling(clContext) {
    LayoutAlgo.call(this, EdgeBundling.name);

    logger.debug('Creating GaussSeidelBarnes kernels');
    this.ebBarnesKernelSeq = new EbBarnesKernelSeq(clContext);

    this.ebMidsprings = new Kernel('gaussSeidelMidsprings', EdgeBundling.argsMidsprings,
                                   EdgeBundling.argsType, 'edgeBundling.cl', clContext);

    this.faSwingsKernel = new FaSwingsKernel(clContext);

    this.integrateMidPoints = new IntegrateMidPointsKernel(clContext);

    this.interpolateMidPoints = new InterpolateMidPoints(clContext);

    this.midEdgeGather = new MidEdgeGather(clContext);

    this.kernels = this.kernels.concat([this.ebBarnesKernelSeq.toBarnesLayout, this.ebBarnesKernelSeq.boundBox,
                                        this.ebBarnesKernelSeq.buildTree, this.ebBarnesKernelSeq.computeSums,
                                        this.ebBarnesKernelSeq.sort, this.ebBarnesKernelSeq.calculateMidPoints,
                                        this.ebMidsprings, this.integrateMidPoints.faIntegrate, this.interpolateMidPoints.interpolate]);
}
EdgeBundling.prototype = Object.create(LayoutAlgo.prototype);
EdgeBundling.prototype.constructor = EdgeBundling;

EdgeBundling.name = 'EdgeBundling';

EdgeBundling.argsMidsprings = ['numSplits', 'springs', 'workList', 'inputPoints', 'inputForces',
                               'inputMidPoints', 'outputMidPoints', 'springMidPositions',
                               'midSpringsColorCoords', 'springStrength', 'springDistance',
                               'stepNumber'];

EdgeBundling.argsType = {
    numPoints: cljs.types.uint_t,
    numSplits: cljs.types.uint_t,
    inputMidPositions: null,
    outputMidPositions: null,
    tilePointsParam: cljs.types.local_t,
    width: cljs.types.float_t,
    height: cljs.types.float_t,
    charge: cljs.types.float_t,
    gravity: cljs.types.float_t,
    randValues: null,
    stepNumber: cljs.types.uint_t,
    springs: null,
    workList: null,
    inputPoints: null,
    inputMidPoints: null,
    outputMidPoints: null,
    springMidPositions: null,
    midSpringsColorCoords: null,
    inputForces: null,
    springStrength: cljs.types.float_t,
    springDistance: cljs.types.float_t,
};

EdgeBundling.prototype.setPhysics = function (cfg) {
    var flags,
        flagNames;
    LayoutAlgo.prototype.setPhysics.call(this, cfg);

    // get the flags from previous iteration
    flags = this.ebBarnesKernelSeq.toBarnesLayout.get('flags');
    flagNames = ['preventOverlap', 'strongGravity', 'dissuadeHubs', 'linLog'];

    _.each(cfg, function (val, flag) {
        var idx,
            mask;

        idx = flagNames.indexOf(flag);
        if (idx >= 0) {
            mask = 0 | (1 << idx);
            if (val) {
                flags |= mask;
            } else {
                flags &= ~mask;
            }
        }
    });

    this.ebBarnesKernelSeq.setPhysics(flags);
    this.integrateMidPoints.setPhysics(flags);
    //this.edgeKernelSeq.setPhysics(flags);
};


// TODO (paden) This should be combined into barnesKernelsSeq
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
        logger.warn('Expected slow kernels: sort, calculate_forces');
    }

    return _.mapObject(numWorkGroups, function (val) {
        val[0] = val[0] * val[1];
        return val;
    });
}

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
    simulator.resetBuffers(tempLayoutBuffers);
    return Q.all([
        simulator.cl.createBuffer(Float32Array.BYTES_PER_ELEMENT, 'global_speed'),
        simulator.cl.createBuffer(2 * simulator.numMidPoints * Float32Array.BYTES_PER_ELEMENT, 'prevForces'),
        simulator.cl.createBuffer(2 * simulator.numMidPoints * Float32Array.BYTES_PER_ELEMENT, 'curForces'),
        simulator.cl.createBuffer(2 * simulator.numMidPoints * Float32Array.BYTES_PER_ELEMENT, 'tempMidPoints'),
        simulator.cl.createBuffer(1 * simulator.numMidPoints * Float32Array.BYTES_PER_ELEMENT, 'swings'),
        simulator.cl.createBuffer(1 * simulator.numMidPoints * Float32Array.BYTES_PER_ELEMENT, 'tractions')
    ]).spread(function (globalSpeed, prevForces, curForces, tempMidPoints, swings, tractions) {
        tempLayoutBuffers.globalSpeed = globalSpeed;
        tempLayoutBuffers.prevForces = prevForces;
        tempLayoutBuffers.curForces = curForces;
        tempLayoutBuffers.tempMidPoints = tempMidPoints;
        tempLayoutBuffers.swings = swings;
        tempLayoutBuffers.tractions = tractions;
        return tempLayoutBuffers;
    }).catch(Log.makeQErrorHandler(logger, 'setupTempBuffers'));
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
        that.ebBarnesKernelSeq.setMidPoints(simulator, tempLayoutBuffers, warpsize, workItems);
        that.faSwingsKernel.setMidPoints(simulator, tempLayoutBuffers);

        that.ebMidsprings.set({
            numSplits: global.numSplits,
            springs: simulator.buffers.forwardsEdges.buffer,
            workList: simulator.buffers.forwardsWorkItems.buffer,
            inputPoints: simulator.buffers.curPoints.buffer,
            inputForces: tempLayoutBuffers.tempMidPoints.buffer,
            inputMidPoints: simulator.buffers.curMidPoints.buffer,
            outputMidPoints: tempLayoutBuffers.curForces.buffer,
            springMidPositions: simulator.buffers.midSpringsPos.buffer,
            midSpringsColorCoords: simulator.buffers.midSpringsColorCoord.buffer
        });
    });
};

// TODO Should we do forwards and backwards edges?
function midEdges(simulator, ebMidsprings, stepNumber) {
    var resources = [
        simulator.buffers.forwardsEdges,
        simulator.buffers.forwardsWorkItems,
        simulator.buffers.curPoints,
        simulator.buffers.nextMidPoints,
        simulator.buffers.curMidPoints,
        simulator.buffers.midSpringsPos,
        simulator.buffers.midSpringsColorCoord,
    ];

    ebMidsprings.set({stepNumber: stepNumber});

    simulator.tickBuffers(['curMidPoints', 'midSpringsPos', 'midSpringsColorCoord']);

    logger.debug('Running kernel gaussSeidelMidsprings');
    return ebMidsprings.exec([simulator.numForwardsWorkItems], resources);
}


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

EdgeBundling.prototype.tick = function (simulator, stepNumber) {

    var workGroupSize,
        workItems,
        that,
        locks,
        calculateMidpoints;

    workGroupSize = 256;
    workItems = getNumWorkitemsByHardware(simulator.cl.deviceProps, workGroupSize);
    that = this;
    locks = simulator.controls.locks;
    if (locks.lockMidpoints && locks.lockMidedges) {
        logger.debug('LOCKED, EARLY EXIT');
        return new Q();
    }

    if (locks.lockMidpoints) {
        simulator.tickBuffers(['nextMidPoints']);
        return simulator.buffers.curMidPoints.copyInto(simulator.buffers.nextMidPoints);
    }

    if (locks.interpolateMidPointsOnce || locks.interpolateMidPoints) {
        if ( locks.interpolateMidPointsOnce ) {
            logger.info("Force interpolation of midpoints");
        }
        locks.interpolateMidPointsOnce = false;
        // If interpolateMidpoints is true, midpoints are calculate by
        // interpolating between corresponding edge points.
        logger.info("INTERPOLATION");
        calculateMidpoints = new Q().then(function () {

            simulator.tickBuffers(['nextMidPoints']);
            return that.interpolateMidPoints.execKernels(simulator);
        });
    } else {
      // If interpolateMidpoints is not true, calculate midpoints
      // by edge bundling algorithm.
        calculateMidpoints =  new Q().then(function () {
            var midpointIndex,
                condition,
                body;

            // Promise while loop to calculate each set of midpoints seperately.
            midpointIndex = 0;
            condition = function () {
                return midpointIndex < simulator.numSplits;
            };

            body = function () {
                return that.ebBarnesKernelSeq.execKernels(simulator, stepNumber, workItems, midpointIndex)
                    .then(function () {
                        midpointIndex = midpointIndex + 1;
                    });
            };

            return promiseWhile(condition, body);

        }).then(function () { //TODO do both forwards and backwards?
            if (simulator.numEdges > 0 && !locks.lockMidedges) {
                return midEdges(simulator, that.ebMidsprings, stepNumber);
            }

            //simulator.tickBuffers(['curMidPoints']);
            //return simulator.buffers.nextMidPoints.copyInto(simulator.buffers.curMidPoints);
        }).then(function () {
            return that.faSwingsKernel.execMidPointsKernels(simulator, workItems);
        }).then(function () {
            return that.integrateMidPoints.execKernels(simulator, tempLayoutBuffers, workItems);
        }).then(function () {
            return simulator.buffers.nextMidPoints.copyInto(simulator.buffers.curMidPoints);
        });
    }
    return calculateMidpoints.then(function () {
        return that.midEdgeGather.execKernels(simulator);
    }).then(function () {
        simulator.tickBuffers(['curMidPoints']);
        return Q.all([
            //tempLayoutBuffers.curForces.copyInto(tempLayoutBuffers.prevForces)
            tempLayoutBuffers.curForces.copyInto(tempLayoutBuffers.prevForces)
        ]);
    }).fail(Log.makeQErrorHandler(logger, 'Failure in edgebundling tick'));
};

module.exports = EdgeBundling;

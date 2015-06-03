'use strict';

var debug = require("debug")("graphistry:graph-viz:cl:forceatlas2barnes"),
    _     = require('underscore'),
    cljs  = require('./cl.js'),
    Q     = require('q'),
    log   = require('common/log.js'),
    eh    = require('common/errorHandlers.js')(log),

    LayoutAlgo = require('./layoutAlgo.js'),
    Kernel = require('./kernel.js'),
    BarnesKernelSeq = require('./javascript_kernels/barnesKernelSeq.js'),
    EdgeKernelSeqFast = require('./javascript_kernels/edgeKernelSeqFast.js'),
    faSwingsKernel = require('./javascript_kernels/faSwingsKernel.js'),
    integrateApproxKernel = require('./javascript_kernels/integrateApproxKernel.js'),
    integrateKernel = require('./javascript_kernels/integrateKernel.js');


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
    }

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
        log.warn('Expected slow kernels: sort, calculate_forces');
    }

    return _.mapObject(numWorkGroups, function(val, key) {
        val[0] = val[0] * val[1];
        return val;
    });
}


function ForceAtlas2Barnes(clContext) {
    LayoutAlgo.call(this, ForceAtlas2Barnes.name);

    debug('Creating ForceAtlasBarnes kernels');
    this.barnesKernelSeq = new BarnesKernelSeq(clContext);

    this.edgeKernelSeq = new EdgeKernelSeqFast(clContext);

    this.faSwingsKernel = new faSwingsKernel(clContext);

    this.integrateKernel = new integrateKernel(clContext);

    this.integrateApproxKernel = new integrateApproxKernel(clContext);

    this.kernels = this.kernels.concat([this.barnesKernelSeq.toBarnesLayout, this.barnesKernelSeq.boundBox,
                                        this.barnesKernelSeq.buildTree, this.barnesKernelSeq.computeSums,
                                        this.barnesKernelSeq.sort, this.barnesKernelSeq.calculatePointForces,
                                        this.edgeKernelSeq.mapEdges, this.edgeKernelSeq.segReduce, this.faSwingsKernel.faSwings,
                                        this.integrateKernel.faIntegrate, this.integrateApproxKernel.faIntegrateApprox]);
}

ForceAtlas2Barnes.prototype = Object.create(LayoutAlgo.prototype);
ForceAtlas2Barnes.prototype.constructor = ForceAtlas2Barnes;

ForceAtlas2Barnes.name = 'ForceAtlas2Barnes';

ForceAtlas2Barnes.prototype.setPhysics = function(cfg) {
    LayoutAlgo.prototype.setPhysics.call(this, cfg)

    // get the flags from previous iteration
    var flags = this.barnesKernelSeq.toBarnesLayout.get('flags');
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

    this.barnesKernelSeq.setPhysics(flags);
    this.edgeKernelSeq.setPhysics(flags);
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
    .catch(eh.makeErrorHandler('setupTempBuffers'));
};


ForceAtlas2Barnes.prototype.setEdges = function(simulator) {
    var localPosSize =
            Math.min(simulator.cl.maxThreads, simulator.numMidPoints)
            * simulator.elementsPerPoint
            * Float32Array.BYTES_PER_ELEMENT;

    var global = simulator.controls.global;
    var that = this;

    var vendor = simulator.cl.deviceProps.VENDOR.toLowerCase();
    var warpsize = 1; // Always correct
    if (vendor.indexOf('intel') != -1) {
        warpsize = 16;
    } else if (vendor.indexOf('nvidia') != -1) {
        warpsize = 32;
    } else if (vendor.indexOf('amd') != -1) {
        warpsize = 64;
    }

    var workItems = getNumWorkitemsByHardware(simulator.cl.deviceProps);
    var that = this;
    return setupTempLayoutBuffers(simulator).then(function (tempBuffers) {
      that.edgeKernelSeq.setEdges(simulator, tempBuffers);
      that.barnesKernelSeq.setEdges(simulator, tempBuffers, warpsize, workItems);

    });
}

function pointForces(simulator, barnesKernelSeq, stepNumber) {
     return barnesKernelSeq.execKernels(simulator, stepNumber)
    .fail(function (err) {
        console.error('Computing pointForces failed', err, (err||{}).stack);
    });
}


function edgeForces(simulator, edgeKernelSeq, stepNumber, workItems) {
    var buffers = simulator.buffers;
     return edgeKernelSeq.execKernels(simulator, buffers.forwardsEdges, buffers.forwardsWorkItems,
                                      simulator.numForwardsWorkItems, buffers.backwardsEdges, buffers.backwardsWorkItems,
                                      simulator.numBackwardsWorkItems, buffers.curPoints, stepNumber, workItems);
}

ForceAtlas2Barnes.prototype.tick = function(simulator, stepNumber) {
    var locks = simulator.controls.locks;
    if (locks.lockPoints) {
      console.log("HERE"); 
      var buffers = simulator.buffers;
      simulator.tickBuffers(['curPoints', 'nextPoints']);
      return Q.all([
              buffers.nextPoints.copyInto(buffers.curPoints),
              buffers.curPoints.copyInto(buffers.nextPoints)
              ]);
      //return buffers.curPoints.copyInto(buffers.nextPoints);
      //return Q();
    }
    var that = this;
    var tickTime = Date.now();
    var workItems = getNumWorkitemsByHardware(simulator.cl.deviceProps);
    return that.barnesKernelSeq.execKernels(simulator, stepNumber, workItems)
    .then(function () {
        return edgeForces(simulator, that.edgeKernelSeq, stepNumber, workItems);
    }).then(function () {
        return that.faSwingsKernel.execKernels(simulator, workItems);
    }).then(function () {
        // return integrateApproxKernel(simulator, tempLayoutBuffers);
        return that.integrateKernel.execKernels(simulator, tempLayoutBuffers, workItems);
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

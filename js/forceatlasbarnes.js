'use strict';

var debug = require("debug")("graphistry:graph-viz:cl:forceatlas2barnes"),
    _     = require('underscore'),
    cljs  = require('./cl.js'),
    Q     = require('q'),
    util  = require('./util.js'),
    LayoutAlgo = require('./layoutAlgo.js'),
    Kernel = require('./kernel.js'),
    BarnesKernelSeq = require('./javascript_kernels/barnesKernelSeq.js'),
    EdgeKernelSeqFast = require('./javascript_kernels/edgeKernelSeqFast.js'),
    faSwingsKernel = require('./javascript_kernels/faSwingsKernel.js'),
    integrate1Kernel = require('./javascript_kernels/integrate1Kernel.js'),
    integrate2Kernel = require('./javascript_kernels/integrate2Kernel.js'),
    integrate3Kernel = require('./javascript_kernels/integrate3Kernel.js');


function getNumWorkitemsByHardware(deviceProps, workGroupSize) {
    var numWorkGroups = {
        toBarnesLayout: 30,
        boundBox: 30,
        buildTree: 30,
        computeSums: 10,
        sort: 16,
        calculateForces: 60
    }

    //console.log("DEVICE NAME: ", deviceProps.NAME);
    if (deviceProps.NAME.indexOf('GeForce GT 650M') != -1) {
        numWorkGroups.buildTree = 1;
        numWorkGroups.computeSums = 1;
    } else if (deviceProps.NAME.indexOf('Iris Pro') != -1) {
        numWorkGroups.computeSums = 6;
        numWorkGroups.sort = 8;
    } else if (deviceProps.NAME.indexOf('Iris') != -1) {
        numWorkGroups.computeSums = 6;
        numWorkGroups.sort = 8;
    } else if (deviceProps.NAME.indexOf('HD Graphics 4000') != -1) {
        throw new Error('Unsupported device config: ' + deviceProps.NAME);
    }

    return _.mapObject(numWorkGroups, function(val, key) {
        return workGroupSize * val;
    });
}


function ForceAtlas2Barnes(clContext) {
    LayoutAlgo.call(this, ForceAtlas2Barnes.name);

    debug('Creating ForceAtlasBarnes kernels');
    this.barnesKernelSeq = new BarnesKernelSeq(clContext);

    this.edgeKernelSeq = new EdgeKernelSeqFast(clContext);

    this.faSwingsKernel = new faSwingsKernel(clContext);

    this.integrate1Kernel = new integrate1Kernel(clContext);

    this.integrate2Kernel = new integrate2Kernel(clContext);

    this.integrate3Kernel = new integrate3Kernel(clContext);

    this.kernels = this.kernels.concat([this.barnesKernelSeq.toBarnesLayout, this.barnesKernelSeq.boundBox,
                                        this.barnesKernelSeq.buildTree, this.barnesKernelSeq.computeSums,
                                        this.barnesKernelSeq.sort, this.barnesKernelSeq.calculateForces,
                                        this.edgeKernelSeq.mapEdges, this.edgeKernelSeq.segReduce, this.faSwingsKernel.faSwings,
                                        this.integrate1Kernel.faIntegrate, this.integrate2Kernel.faIntegrate2,
                                        this.integrate3Kernel.faIntegrate3]);
}

ForceAtlas2Barnes.prototype = Object.create(LayoutAlgo.prototype);
ForceAtlas2Barnes.prototype.constructor = ForceAtlas2Barnes;

ForceAtlas2Barnes.name = 'ForceAtlas2Barnes';

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
    .catch(util.makeErrorHandler('setupTempBuffers'));
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

    var that = this;
    return setupTempLayoutBuffers(simulator).then(function (tempBuffers) {
      that.edgeKernelSeq.setEdges(simulator, tempBuffers);
      that.barnesKernelSeq.setEdges(simulator, tempBuffers, warpsize);

    });
}

function pointForces(simulator, barnesKernelSeq, stepNumber) {
     return barnesKernelSeq.execKernels(simulator, stepNumber)
    .fail(function (err) {
        console.error('Computing pointForces failed', err, (err||{}).stack);
    });
}


function edgeForces(simulator, edgeKernelSeq, stepNumber) {
    var buffers = simulator.buffers;
     return edgeKernelSeq.execKernels(simulator, buffers.forwardsEdges, buffers.forwardsWorkItems,
                                      simulator.numForwardsWorkItems, buffers.backwardsEdges, buffers.backwardsWorkItems,
                                      simulator.numBackwardsWorkItems, buffers.curPoints, stepNumber);
}



ForceAtlas2Barnes.prototype.tick = function(simulator, stepNumber) {
    var that = this;
    var tickTime = Date.now();
    var workGroupSize = 256;
    var workItems = getNumWorkitemsByHardware(simulator.cl.deviceProps, workGroupSize);
    return that.barnesKernelSeq.execKernels(simulator, stepNumber, workItems)
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

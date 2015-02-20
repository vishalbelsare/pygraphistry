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


    this.kernels = this.kernels.concat([this.barnesKernelSeq.toBarnesLayout, this.barnesKernelSeq.boundBox,
                                        this.barnesKernelSeq.buildTree, this.barnesKernelSeq.computeSums,
                                        this.barnesKernelSeq.sort, this.barnesKernelSeq.calculateForces,
                                        this.barnesKernelSeq.move, this.edgeKernelSeq.faEdges,
                                        this.faSwingsKernel.faSwings, this.integrate1Kernel.faIntegrate,
                                        this.integrate2Kernel.faIntegrate2, this.integrate3Kernel.faIntegrate3]);
}

ForceAtlas2Barnes.prototype = Object.create(LayoutAlgo.prototype);
ForceAtlas2Barnes.prototype.constructor = ForceAtlas2Barnes;

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

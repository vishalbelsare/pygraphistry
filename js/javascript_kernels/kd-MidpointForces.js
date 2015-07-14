var Kernel = require('../kernel.js'),
    Q = require('q'),
    debug = require("debug")("graphistry:graph-viz:cl:kd-MidpointForces"),
    _     = require('underscore'),
    log = require('common/log.js'),
    eh = require('common/errorHandlers.js')(log),
    cljs  = require('../cl.js');

// This module is intended to calculate forces on midedges using a kd-tree.
var MidpointForces = function (clContext) {

    // List of kernels (needed for perf benchmarks)
    this.kernels = [];

    // Kernel Specifications.
    // key & name: the javascript variable names of of the kernel wrappers
    // kernelName: the name kernel in the .cl file.
    // args: a list of the buffer names used by this kernel. They must be ordered according
    // to their respective parameters in the .cl file.
    // fileName: location of the .cl file.
    var kernelSpecs = {
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
            args : ['xCoords', 'yCoords', 'children', 'mass', 'start', 'xmins', 'xmaxs',
                'ymins', 'ymaxs', 'edgeMins', 'edgeMaxs', 'swings', 'tractions',
                'blocked', 'step', 'bottom', 'radius', 'globalSpeed', 'stepNumber',
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

    var argsType = {
        numPoints: cljs.types.uint_t,
        inputPositions: null,
        inputMidPositions: null,
        stepNumber: cljs.types.uint_t,
        inputPoints: null,
        curForces: null,
        prevForces: null,
        mass: null,
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
        start: null,
        sort: null,
        xmins: null,
        xmaxs: null,
        ymins: null,
        ymaxs: null,
        edgeMins: null,
        edgeMaxs: null,
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

    // Temporary buffers needed only for KD-tree force calculation
    var kdBuffers  = {
        xCoords: null,
        yCoords: null,
        edgeDirectionX: null,
        edgeDirectionY: null,
        edgeLengths: null,
        children: null,
        xmins: null,
        ymins:  null,
        ymins: null,
        ymaxs: null,
        edgeMins: null,
        edgeMaxs: null,
        count: null,
        blocked: null,
        step: null,
        sort: null,
        bottom: null,
        maxDepth: null,
    };

    var that = this;
    // Create the kernels described by kernel specifications
    _.each( kernelSpecs, function (kernel) {
        var newKernel =
            new Kernel(kernel.kernelName, kernel.args, argsType, kernel.fileName, clContext)
        that[kernel.name] = newKernel;
        that.kernels.push(newKernel);
    });

    // Determine the size needed for each temporary buffer
    var BufferSizes = function(simulator, warpsize, numBodies, numNodes) {
        // TODO Set this to the number of workgroups in boundBox kernel
        var numWorkGroups = 30;
        var numDimensions = 2;
        return {
            xCoords : (numNodes + 1) * Float32Array.BYTES_PER_ELEMENT,
            mass : (numNodes + 1) * Float32Array.BYTES_PER_ELEMENT,
            yCoords : (numNodes + 1) * Float32Array.BYTES_PER_ELEMENT,
            edgeLengths : (numNodes + 1) * Float32Array.BYTES_PER_ELEMENT,
            edgeDirectionX : (numNodes + 1) * Float32Array.BYTES_PER_ELEMENT,
            edgeDirectionY : (numNodes + 1) * Float32Array.BYTES_PER_ELEMENT,
            children : 4*(numNodes + 1)*Int32Array.BYTES_PER_ELEMENT,
            start: (numNodes + 1)*Int32Array.BYTES_PER_ELEMENT,
            sort : (numNodes + 1)*Int32Array.BYTES_PER_ELEMENT,
            xmins : (numWorkGroups)*Float32Array.BYTES_PER_ELEMENT,
            xmaxs : (numWorkGroups)*Float32Array.BYTES_PER_ELEMENT,
            ymins : (numWorkGroups)*Float32Array.BYTES_PER_ELEMENT,
            ymaxs :  (numWorkGroups)*Float32Array.BYTES_PER_ELEMENT,
            edgeMins : (numWorkGroups)*Float32Array.BYTES_PER_ELEMENT,
            edgeMaxs : (numWorkGroups)*Float32Array.BYTES_PER_ELEMENT,
            count : (numNodes + 1)*Int32Array.BYTES_PER_ELEMENT,
            blocked : Int32Array.BYTES_PER_ELEMENT,
            step : Int32Array.BYTES_PER_ELEMENT,
            bottom : Int32Array.BYTES_PER_ELEMENT,
            maxDepth : Int32Array.BYTES_PER_ELEMENT,
            radius : numDimensions * Float32Array.BYTES_PER_ELEMENT,
            globalSpeed : Float32Array.BYTES_PER_ELEMENT
        }
    }

    // Returns a buffer map with all of the bindings needed for the buffers used for this sequences
    var getBufferBindings = function (layoutBuffers, tempBuffers, simulator, warpsize, workItems) {
        var numBodies = simulator.numEdges;
        var numNodes = getNumNodes(numBodies, warpsize);
        return {
            THREADS_BOUND: workItems.boundBox[1],
            THREADS_FORCES: workItems.calculateForces[1],
            THREADS_SUMS: workItems.computeSums[1],
            WARPSIZE:warpsize,
            blocked:tempBuffers.blocked,
            bottom:tempBuffers.bottom,
            children:tempBuffers.children,
            count:tempBuffers.count,
            edgeDirectionX: tempBuffers.edgeDirectionX,
            edgeDirectionY: tempBuffers.edgeDirectionY,
            edgeLengths: tempBuffers.edgeLengths,
            edgeMaxs:tempBuffers.edgeMaxs,
            edgeMins:tempBuffers.edgeMins,
            globalSpeed: layoutBuffers.globalSpeed,
            xmaxs:tempBuffers.xmaxs,
            xmins:tempBuffers.xmins,
            ymaxs:tempBuffers.ymaxs,
            ymins:tempBuffers.ymins,
            inputMidPositions: simulator.buffers.curMidPoints,
            inputPositions: simulator.buffers.curPoints,
            maxDepth:tempBuffers.maxDepth,
            nextMidPoints:layoutBuffers.tempMidPoints,
            numBodies:numBodies,
            numNodes:numNodes,
            numPoints:simulator.numEdges,
            radius:tempBuffers.radius,
            sort:tempBuffers.sort,
            springs: simulator.buffers.forwardsEdges,
            start:tempBuffers.start,
            step:tempBuffers.step,
            swings:layoutBuffers.swings,
            tractions:layoutBuffers.tractions,
            xCoords: tempBuffers.xCoords,
            yCoords:tempBuffers.yCoords,
            mass: tempBuffers.mass
        }
    };

    // Return the number of nodes for kd-tree implementation
    var getNumNodes = function(numBodies, warpsize) {
        // Adjust sizes for optimized memory
        var blocks = 8; //TODO (paden) should be set to multiprocecessor count
        numNodes = numBodies * 5;
        if (numNodes < 1024*blocks) {
            numNodes = 1024*blocks;
        }
        while ((numNodes & (warpsize - 1)) != 0) {
            numNodes++;
        }
        return numNodes;
    };

    this.setArgs = function (kernel, kernelName, bufferBindings) {
        var params = kernelSpecs[kernelName];
        var args = params.args;
        var flags = ['tau', 'flags', 'stepNumber']
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
        return this.setupTempBuffers(simulator, warpsize, simulator.numEdges).then(function (tempBuffers) {
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

    this.setupTempBuffers = function(simulator, warpsize, numBodies) {

        var numNodes = getNumNodes(numBodies, warpsize);

        simulator.resetBuffers(kdBuffers);

        var bufferSizes = BufferSizes(simulator, warpsize, numBodies, numNodes);
        var memoryAllocationPromises = _.map(bufferSizes, function (value, key) {
            return simulator.cl.createBuffer(value, key);
        })

        return Q.all(
            memoryAllocationPromises
        )
        .then(function (buffers) {
            _.each(_.keys(bufferSizes), function (value, index) {
                kdBuffers[value] = buffers[index];
            });
            return kdBuffers;
        })
        .fail(eh.makeErrorHandler("Setting temporary buffers for barnesHutKernelSequence failed"));
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
            //console.log("After Kd Layout");
            return that.boundBox.exec([workItems.boundBox[0]], resources, [workItems.boundBox[1]]);
        })

        .then(function () {
        //console.log("After bound box");
        return that.buildTree.exec([workItems.buildTree[0]], resources, [workItems.buildTree[1]]);
        })

        .then(function () {
        //console.log("After build Tree");
        return that.computeSums.exec([workItems.computeSums[0]], resources, [workItems.computeSums[1]]);
        })

        .then(function () {
        //console.log("After sums");
        return that.sort.exec([workItems.sort[0]], resources, [workItems.sort[1]]);
        })

        .then(function () {
        //console.log("Sort");
        return that.calculateMidPoints.exec([workItems.calculateForces[0]], resources, [workItems.calculateForces[1]]);
        })
        .fail(eh.makeErrorHandler("Executing kd-tree edge bundling failed"));
    };

    this.setPhysics = function(flag) {
        // This shouldn't be called.
    };

    this.getFlags = function() {
        return undefined;
    }

};

module.exports = MidpointForces;


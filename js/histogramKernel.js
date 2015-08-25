'use strict';

var    cljs = require('./cl.js'),
          Q = require('q'),
     Kernel = require('./kernel.js');

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz:cl:histogramKernel');

var MAX_NUM_BINS = 256;

function HistogramKernel(clContext) {
    logger.trace('Creating histogram kernel');

    var args = ['numBins', 'dataSize', 'check', 'binStart', 'indices', 'data', 'output',
            'outputSum', 'outputMean', 'outputMax', 'outputMin'
    ];
    var argsType = {
        numBins: cljs.types.uint_t,
        dataSize: cljs.types.uint_t,
        check: null,
        binStart: null,
        indices: null,
        data: null,
        output: null,
        outputSum: null,
        outputMean: null,
        outputMax: null,
        outputMin: null
    };

    this.histogramKernel = new Kernel('histogram', args, argsType, 'histogram.cl', clContext);
}

HistogramKernel.prototype.setIndices = function (simulator, indices) {
    if (!this.qBuffers) {
        this.initializeBuffers(simulator);
    }

    // TODO: Use a proper lookup table by name instead of arbitrary indexing.
    // TODO: Figure out why this turns into a regular buffer from a promise on second call.
    // HACK. Check if it's a promise or not.
    var maybePromise = this.qBuffers[6];
    if (maybePromise.then !== undefined) {
        return maybePromise.then(function (indexBuffer) {
            return indexBuffer.write(indices);
        });
    } else {
        return maybePromise.write(indices);
    }
}

HistogramKernel.prototype.initializeBuffers = function (simulator) {
    var maxSizeInput = Math.max(simulator.dataframe.numPoints(), simulator.dataframe.numEdges());
    var maxSizeOutput = MAX_NUM_BINS;
    var maxBytesInput = maxSizeInput * Float32Array.BYTES_PER_ELEMENT;
    var maxBytesOutput = maxSizeOutput * Float32Array.BYTES_PER_ELEMENT;
    this.outputZeros = new Uint32Array(maxSizeOutput);
    this.qBuffers = [
        simulator.cl.createBuffer(maxBytesOutput, 'histogram_output'),
        simulator.cl.createBuffer(maxBytesOutput, 'histogram_outputSum'),
        simulator.cl.createBuffer(maxBytesOutput, 'histogram_outputMean'),
        simulator.cl.createBuffer(maxBytesOutput, 'histogram_outputMax'),
        simulator.cl.createBuffer(maxBytesOutput, 'histogram_outputMin'),
        simulator.cl.createBuffer(maxBytesInput, 'histogram_data'),
        simulator.cl.createBuffer(maxBytesInput, 'histogram_indices'),
        simulator.cl.createBuffer(maxBytesOutput, 'histogram_binStart'),
        simulator.cl.createBuffer(8, 'histogram_check')
    ];
}


HistogramKernel.prototype.run = function (simulator, numBins, dataSize, dataBuffer, indicesTyped, bins) {
    logger.debug('Running histogram kernel.');
    var that = this;

    // TODO: Take in type(s) to run as an argument.
    var checkTyped = new Uint32Array([0]);
    checkTyped[0] = checkTyped[0] | (1);
    checkTyped[0] = checkTyped[0] | (1 << 5);

    if (!that.qBuffers) {
        that.initializeBuffers(simulator);
    }

    return Q.all(that.qBuffers).spread(function (
            output, outputSum, outputMean, outputMax, outputMin, data, indices, binStart, check
    ){
        that.buffers = {
            output: output,
            outputSum: outputSum,
            outputMean: outputMean,
            outputMax: outputMax,
            outputMin: outputMin,
            data: data,
            indices: indices,
            binStart: binStart,
            check: check
        };

        that.histogramKernel.set({
            numBins: numBins,
            dataSize: dataSize,
            output: output.buffer,
            outputSum: outputSum.buffer,
            outputMean: outputMean.buffer,
            outputMax: outputMax.buffer,
            outputMin: outputMin.buffer,
            data: dataBuffer.buffer,
            indices: indices.buffer,
            binStart: binStart.buffer,
            check: check.buffer
        });

        return Q.all([
            output.write(that.outputZeros),
            // data.write(dataTyped),
            binStart.write(bins),
            check.write(checkTyped)
            // indices.write(indicesTyped)
        ]).fail(log.makeQErrorHandler(logger, 'Writing to buffers for histogram kernel failed'));
    }).then(function () {

        var workGroupSize = Math.min(256, simulator.cl.deviceProps.MAX_WORK_GROUP_SIZE);
        var VT = 16;
        var numWorkItems = dataSize + (workGroupSize - (dataSize % workGroupSize));
        // numWorkItems = numWorkItems + (VT - (numWorkItems % VT));
        // console.log(numWorkItems, workGroupSize, simulator.cl.deviceProps.MAX_WORK_GROUP_SIZE);
        return that.histogramKernel.exec([numWorkItems], [], [workGroupSize])
            .then(function () {

                var retOutput = new Int32Array(MAX_NUM_BINS * Int32Array.BYTES_PER_ELEMENT);

                // TODO: Return all outputs, not just count;
                return that.buffers.output.read(retOutput).then(function () {
                    return new Int32Array(retOutput.buffer, 0, numBins);
                }).fail(log.makeQErrorHandler(logger, 'Reading histogram output failed'));

            }).fail(log.makeQErrorHandler(logger, 'Kernel histogram failed'));
    }).fail(log.makeQErrorHandler(logger, 'Histogram Failed'));

}

module.exports = HistogramKernel;

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


HistogramKernel.prototype.run = function (simulator, numBins, dataSize, dataBuffer, indicesTyped, bins) {
    logger.debug('Running histogram kernel.');
    var that = this;
    var start;

    // TODO: Take in type(s) to run as an argument.
    var checkTyped = new Uint32Array([0]);
    checkTyped[0] = checkTyped[0] | (1);
    checkTyped[0] = checkTyped[0] | (1 << 5);

    if (!that.qBuffers) {
        var maxSizeInput = Math.max(simulator.dataframe.rawdata.numElements.point, simulator.dataframe.rawdata.numElements.edge);
        var maxSizeOutput = MAX_NUM_BINS;
        var maxBytesInput = maxSizeInput * Float32Array.BYTES_PER_ELEMENT;
        var maxBytesOutput = maxSizeOutput * Float32Array.BYTES_PER_ELEMENT;
        that.outputZeros = new Uint32Array(maxSizeOutput);
        that.qBuffers = [
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

        start = Date.now();

        return Q.all([
            output.write(that.outputZeros),
            // data.write(dataTyped),
            binStart.write(bins),
            check.write(checkTyped),
            indices.write(indicesTyped)
        ]).fail(log.makeQErrorHandler(logger, 'Writing to buffers for histogram kernel failed'));
    }).then(function () {
        console.log('[HISTOGRAM] Writing took: ', (Date.now() - start));
        logger.debug('Wrote to buffers, executing histogram kernel');

        var workGroupSize = 128;
        var numWorkItems = dataSize + (workGroupSize - (dataSize % workGroupSize));

        return that.histogramKernel.exec([numWorkItems], [], [workGroupSize])
            .then(function () {

                var retOutput = new Int32Array(MAX_NUM_BINS * Int32Array.BYTES_PER_ELEMENT);
                // TODO: Return all outputs, not just count;
                return that.buffers.output.read(retOutput).then(function () {
                    logger.debug('Read histogram, returning');
                    return new Int32Array(retOutput.buffer, 0, numBins);
                }).fail(log.makeQErrorHandler(logger, 'Reading histogram output failed'));

            }).fail(log.makeQErrorHandler(logger, 'Kernel histogram failed'));
    }).fail(log.makeQErrorHandler(logger, 'Histogram Failed'));

}

module.exports = HistogramKernel;

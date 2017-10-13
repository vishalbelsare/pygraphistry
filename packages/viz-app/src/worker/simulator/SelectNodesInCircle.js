'use strict';

var cljs = require('./cl.js'),
    Q = require('q');

var log = require('@graphistry/common').logger;
var logger = log.createLogger('graph-viz', 'graph-viz/js/SelectNodesInCircle.js');

function SelectNodesInCircle(clContext, kernelCache) {
    logger.trace('Creating selectNodesInCircle kernel');

    var args = ['center_x', 'center_y', 'radius_squared', 'positions', 'mask'];
    var argsType = {
        center_x: cljs.types.float_t,
        center_y: cljs.types.float_t,
        radius_squared: cljs.types.float_t,
        positions: null,
        mask: null
    };
    this.kernel = kernelCache.fetchOrCreate(
        'selectNodesInCircle',
        args,
        argsType,
        'selectNodesInCircle.cl',
        clContext
    );
}

SelectNodesInCircle.prototype.run = function(simulator, selection, delta) {
    var that = this;
    var numPoints = simulator.dataframe.getNumElements('point');

    if (!that.qMask || that.bytes < numPoints * Uint8Array.BYTES_PER_ELEMENT) {
        that.bytes = numPoints * Uint8Array.BYTES_PER_ELEMENT;
        that.qMask = simulator.cl.createBuffer(that.bytes, 'mask');
    }

    return that.qMask
        .then(function(mask) {
            logger.trace('Computing selection mask');

            that.kernel.set({
                center_x: selection.center.x,
                center_y: selection.center.y,
                radius_squared: selection.radius * selection.radius,
                positions: simulator.dataframe.getBuffer('curPoints', 'simulator').buffer,
                mask: mask.buffer
            });

            simulator.tickBuffers(['nextPoints', 'curPoints']);

            logger.trace('Running selectNodesInCircle');
            return that.kernel
                .exec([numPoints])
                .then(function() {
                    var result = new Uint8Array(numPoints);
                    return mask.read(result, 0, result.byteLength).then(function() {
                        return result;
                    });
                })
                .fail(log.makeQErrorHandler(logger, 'Kernel selectNodesInCircle failed'));
        })
        .fail(log.makeQErrorHandler(logger, 'Node selection failed'));
};

export default SelectNodesInCircle;

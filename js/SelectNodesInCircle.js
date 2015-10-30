'use strict';

var    cljs = require('./cl.js'),
          Q = require('q'),
     Kernel = require('./kernel.js');

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz:cl:selectNodesInCircle');

function SelectNodesInCircle(clContext) {
    logger.trace('Creating selectNodesInCircle kernel');

    var args = ['center_x', 'center_y', 'radius', 'positions', 'mask'];
    var argsType = {
        center_x: cljs.types.float_t,
        center_y: cljs.types.float_t,
        radius: cljs.types.float_t,
        positions: null,
        mask: null
    };
    this.kernel = new Kernel('selectNodesInCircle', args, argsType, 'selectNodesInCircle.cl', clContext);
}


SelectNodesInCircle.prototype.run = function (simulator, selection, delta) {
    var that = this;
    var numPoints = simulator.dataframe.getNumElements('point');

    if (!that.qMask) {
        that.bytes = numPoints * Uint8Array.BYTES_PER_ELEMENT;
        that.qMask = simulator.cl.createBuffer(that.bytes, 'mask');
    }

    return that.qMask.then(function (mask) {
        logger.trace('Computing selection mask');
        var resources = [simulator.dataframe.getBuffer('curPoints', 'simulator')];

        that.kernel.set({
            center_x: selection.center.x,
            center_y: selection.center.y,
            radius: selection.radius,
            positions: simulator.dataframe.getBuffer('curPoints', 'simulator').buffer,
            mask: mask.buffer
        });

        simulator.tickBuffers(['nextPoints', 'curPoints']);

        logger.trace('Running selectNodesInCircle');
        return that.kernel.exec([numPoints], resources)
            .then(function () {
                var result = new Uint8Array(that.bytes);
                return mask.read(result).then(function () {
                    return result;
                });
            }).fail(log.makeQErrorHandler(logger, 'Kernel selectNodesInCircle failed'));
    }).fail(log.makeQErrorHandler(logger, 'Node selection failed'));

};

module.exports = SelectNodesInCircle;

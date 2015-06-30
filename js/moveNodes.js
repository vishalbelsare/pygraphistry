'use strict';

var    cljs = require('./cl.js'),
          Q = require('q'),
     Kernel = require('./kernel.js'),
        Log = require('common/logger.js'),
     logger = Log.createLogger('graph-viz:cl:movenodes');

function MoveNodes(clContext) {
    logger.trace('Creating moveNodes kernel');

    var args = ['top', 'left', 'bottom', 'right', 'deltaX', 'deltaY',
                'inputPositions', 'outputPositions'];
    var argsType = {
        top: cljs.types.float_t,
        left: cljs.types.float_t,
        bottom: cljs.types.float_t,
        right: cljs.types.float_t,
        deltaX: cljs.types.float_t,
        deltaY: cljs.types.float_t,
        inputPositions: null,
        outputPositions: null
    }
    this.moveNodes = new Kernel('moveNodes', args, argsType, 'moveNodes.cl', clContext);
}


MoveNodes.prototype.run = function (simulator, selection, delta) {
    logger.trace('Moving nodes');
    var resources = [simulator.buffers.curPoints, simulator.buffers.nextPoints];

    this.moveNodes.set({
        top: selection.tl.y,
        left: selection.tl.x,
        bottom: selection.br.y,
        right: selection.br.x,
        deltaX: delta.x,
        deltaY: delta.y,
        inputPositions: simulator.buffers.curPoints.buffer,
        outputPositions: simulator.buffers.nextPoints.buffer,
    });

    simulator.tickBuffers(['nextPoints', 'curPoints']);

    logger.trace('Running moveNodes');
    return this.moveNodes.exec([simulator.numPoints], resources)
        .then(function () {
            return simulator.buffers.nextPoints.copyInto(simulator.buffers.curPoints);
        }).fail(Log.makeQErrorHandler(logger, 'Kernel moveNodes failed'));
}

module.exports = MoveNodes;

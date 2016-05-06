'use strict';

var    cljs = require('./cl.js'),
          Q = require('q'),
     Kernel = require('./kernel.js'),
        log = require('common/logger.js'),
     logger = log.createLogger('graph-viz', 'graph-viz/js/moveNodesByIds.js');

function MoveNodesByIds(clContext) {
    logger.trace('Creating moveNodesByIds kernel');

    var args = ['ids', 'deltaX', 'deltaY', 'inputPositions', 'outputPositions'];
    var argsType = {
        ids: null,
        deltaX: cljs.types.float_t,
        deltaY: cljs.types.float_t,
        inputPositions: null,
        outputPositions: null
    };

    this.moveNodesByIds = new Kernel('moveNodesByIds', args, argsType, 'moveNodesByIds.cl', clContext);
}

MoveNodesByIds.prototype.run = function (simulator, ids, diff) {
    var deltaX = diff.x;
    var deltaY = diff.y;

    var inputPositions = simulator.dataframe.getBuffer('curPoints', 'simulator');
    var outputPositions = simulator.dataframe.getBuffer('nextPoints', 'simulator');

    var numPoints = simulator.dataframe.getNumElements('point');
    var outputArray = new Float32Array(numPoints * 2);

    return Q().then(() => {
        return inputPositions.copyInto(outputPositions);
    }).then(() => {
        return inputPositions.read(outputArray);
    }).then(() => {
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            outputArray[id*2] += deltaX;
            outputArray[id*2 + 1] += deltaY;
        }
    }).then(() => {
        return outputPositions.write(outputArray);
    }).then(() => {
        return outputPositions.copyInto(inputPositions);
    }).then(() => {
        simulator.tickBuffers(['nextPoints', 'curPoints']);
    }).fail(log.makeQErrorHandler(logger, 'Kernel moveNodesByIds failed'));
}


// MoveNodes.prototype.run = function (simulator, selection, delta) {
//     logger.trace('Moving nodes');
//     var numPoints = simulator.dataframe.getNumElements('point');
//     var resources = [
//         simulator.dataframe.getBuffer('curPoints', 'simulator'),
//         simulator.dataframe.getBuffer('nextPoints', 'simulator')
//     ];

//     this.moveNodes.set({
//         top: selection.tl.y,
//         left: selection.tl.x,
//         bottom: selection.br.y,
//         right: selection.br.x,
//         deltaX: delta.x,
//         deltaY: delta.y,
//         inputPositions: simulator.dataframe.getBuffer('curPoints', 'simulator').buffer,
//         outputPositions: simulator.dataframe.getBuffer('nextPoints', 'simulator').buffer
//     });

//     simulator.tickBuffers(['nextPoints', 'curPoints']);

//     logger.trace('Running moveNodes');
//     return this.moveNodes.exec([numPoints], resources)
//         .then(function () {
//             var nextPoints = simulator.dataframe.getBuffer('nextPoints', 'simulator');
//             var curPoints = simulator.dataframe.getBuffer('curPoints', 'simulator');
//             return nextPoints.copyInto(curPoints);
//         }).fail(log.makeQErrorHandler(logger, 'Kernel moveNodes failed'));
// };

module.exports = MoveNodesByIds;

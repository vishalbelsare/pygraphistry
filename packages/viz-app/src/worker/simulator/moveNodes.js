'use strict';

var cljs = require('./cl.js'),
  Q = require('q'),
  log = require('@graphistry/common').logger,
  logger = log.createLogger('graph-viz', 'graph-viz/js/moveNodes.js');

function MoveNodes(clContext, kernelCache) {
  logger.trace('Creating moveNodes kernel');

  var args = [
    'top',
    'left',
    'bottom',
    'right',
    'deltaX',
    'deltaY',
    'inputPositions',
    'outputPositions'
  ];
  var argsType = {
    top: cljs.types.float_t,
    left: cljs.types.float_t,
    bottom: cljs.types.float_t,
    right: cljs.types.float_t,
    deltaX: cljs.types.float_t,
    deltaY: cljs.types.float_t,
    inputPositions: null,
    outputPositions: null
  };
  this.moveNodes = kernelCache.fetchOrCreate(
    'moveNodes',
    args,
    argsType,
    'moveNodes.cl',
    clContext
  );
}

MoveNodes.prototype.run = function(simulator, selection, delta) {
  logger.trace('Moving nodes');
  var numPoints = simulator.dataframe.getNumElements('point');

  this.moveNodes.set({
    top: selection.tl.y,
    left: selection.tl.x,
    bottom: selection.br.y,
    right: selection.br.x,
    deltaX: delta.x,
    deltaY: delta.y,
    inputPositions: simulator.dataframe.getBuffer('curPoints', 'simulator').buffer,
    outputPositions: simulator.dataframe.getBuffer('nextPoints', 'simulator').buffer
  });

  simulator.tickBuffers(['nextPoints', 'curPoints']);

  logger.trace('Running moveNodes');
  return this.moveNodes
    .exec([numPoints])
    .then(function() {
      var nextPoints = simulator.dataframe.getBuffer('nextPoints', 'simulator');
      var curPoints = simulator.dataframe.getBuffer('curPoints', 'simulator');
      return nextPoints.copyInto(curPoints);
    })
    .fail(log.makeQErrorHandler(logger, 'Kernel moveNodes failed'));
};

export default MoveNodes;

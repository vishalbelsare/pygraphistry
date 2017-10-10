'use strict';

var cljs = require('./cl.js'),
  Q = require('q');

var log = require('@graphistry/common').logger;
var logger = log.createLogger('graph-viz', 'graph-viz/js/selectNodesInRect.js');

function SelectNodesInRect(clContext, kernelCache) {
  logger.trace('Creating selectNodesInRect kernel');

  var args = ['top', 'left', 'bottom', 'right', 'positions', 'mask'];
  var argsType = {
    top: cljs.types.float_t,
    left: cljs.types.float_t,
    bottom: cljs.types.float_t,
    right: cljs.types.float_t,
    positions: null,
    mask: null
  };
  this.kernel = kernelCache.fetchOrCreate(
    'selectNodesInRect',
    args,
    argsType,
    'selectNodesInRect.cl',
    clContext
  );
}

SelectNodesInRect.prototype.run = function(simulator, selection, delta) {
  var that = this;
  var numPoints = simulator.dataframe.getNumElements('point');

  if (!that.qMask || that.bytes < numPoints * Uint8Array.BYTES_PER_ELEMENT) {
    that.bytes = numPoints * Uint8Array.BYTES_PER_ELEMENT;
    that.qMask = simulator.cl.createBuffer(that.bytes, 'mask');
  }

  return that.qMask
    .then(function(mask) {
      logger.trace('Computing selection mask');
      var resources = [simulator.dataframe.getBuffer('curPoints', 'simulator')];

      that.kernel.set({
        top: selection.tl.y,
        left: selection.tl.x,
        bottom: selection.br.y,
        right: selection.br.x,
        positions: simulator.dataframe.getBuffer('curPoints', 'simulator').buffer,
        mask: mask.buffer
      });

      simulator.tickBuffers(['nextPoints', 'curPoints']);

      logger.trace('Running selectNodesInRect');
      return that.kernel
        .exec([numPoints], resources)
        .then(function() {
          var result = new Uint8Array(numPoints);
          return mask.read(result, 0, result.byteLength).then(function() {
            return result;
          });
        })
        .fail(log.makeQErrorHandler(logger, 'Kernel selectNodesInRect failed'));
    })
    .fail(log.makeQErrorHandler(logger, 'Node selection failed'));
};

export default SelectNodesInRect;

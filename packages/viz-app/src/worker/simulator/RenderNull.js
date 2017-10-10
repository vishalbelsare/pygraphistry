// Implements the same interface as RenderGL, but does not do rendering nor initialize WebGL.
// Can be used as a drop-in replacement for RenderGL when we only want to run the sim, not renderer.

'use strict';

const RenderBase = require('./RenderBase.js');
const Q = require('q');

const log = require('@graphistry/common').logger;
const logger = log.createLogger('graph-viz', 'graph-viz/js/RenderNull.js');

const createBuffer = Q.promised((renderer, data) => {
  logger.trace(
    'Creating (fake) null renderer buffer of type %s. Constructor: %o',
    typeof data,
    (data || {}).constructor
  );

  const bufObj = {
    buffer: null,
    gl: null,
    len: typeof data === 'number' ? data : data.byteLength,
    data: typeof data === 'number' ? null : data
  };

  return bufObj;
});

const noopWrite = function(buffer /* , data */) {
  return Q(buffer);
};

function noop() {
  return true;
}

const noopPromise = Q.promised(() => {
  return;
});

export function createSync(document) {
  const renderer = RenderBase.create();
  logger.trace('Created renderer RenderNull');

  renderer.document = document;

  renderer.createBuffer = createBuffer.bind(this, renderer);
  renderer.setVisible = noop;
  renderer.setColorMap = noopPromise;
  renderer.finish = noop;
  renderer.render = noopPromise;

  renderer.elementsPerPoint = 2;
  renderer.numPoints = 0;
  renderer.numEdges = 0;
  renderer.numMidPoints = 0;
  renderer.numMidEdges = 0;

  return renderer;
}

/**
 * @returns Promise<Renderer>
 */
export const create = Q.promised(createSync);

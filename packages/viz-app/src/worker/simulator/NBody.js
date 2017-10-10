'use strict';

const Q = require('q');
const lConf = require('./layout.config.js');
const events = require('./SimpleEvents.js');
const _ = require('underscore');
// const clientNotification = require('./clientNotification.js');

const log = require('@graphistry/common').logger;
const logger = log.createLogger('graph-viz', 'graph-viz/js/NBody');

const ELEMENTS_PER_POINTS = 2;

/**
 * @param {Object} graph
 * @returns {GraphManager}
 */
export function createSync(graph) {
  _.each(
    {
      setVertices: setVertices,
      setEdges: setEdges,
      setMidEdgeColors: setMidEdgeColors,
      tick: tick,
      updateSettings: updateSettings
    },
    (setter, setterName) => {
      graph[setterName] = setter.bind('', graph);
    }
  );

  return graph;
}

/** @typedef {Object} GraphManager
 * @property renderer
 * @property socket
 * @property {Number} stepNumber
 * @property {Dataframe} dataframe
 */

/**
 * Create a new N-body graph and return a promise for the graph object
 *
 * @param simulator - the module of the simulator backend to use
 * @param renderer - the module of the rendering backend to use
 * @param {Dataframe} dataframe
 * @param {String} device
 * @param {String} vendor
 * @param {String} controls
 * @param socket
 * @returns {GraphManager}
 */
export function create(renderer, simulator, dataframe, device, vendor, controls, socket) {
  /** @type {GraphManager} */
  const graph = {
    renderer: renderer,
    socket: socket,
    stepNumber: 0,
    dataframe: dataframe
  };

  _.each(
    {
      setVertices: setVertices,
      setEdges: setEdges,
      setMidEdgeColors: setMidEdgeColors,
      tick: tick,
      updateSettings: updateSettings
    },
    (setter, setterName) => {
      graph[setterName] = setter.bind('', graph);
    }
  );

  return clientNotification
    .loadingStatus(socket, 'Creating physics simulator')
    .then(() => {
      graph.simulator = simulator;
      graph.globalControls = simulator.controls.global;
    })
    .then(() => {
      Object.seal(graph);
      return graph;
    })
    .fail(log.makeQErrorHandler(logger, 'Cannot initialize nbody'));
}

function updateSettings(graph, newCfg) {
  logger.debug('Updating simulation settings', newCfg);
  if (newCfg.simControls) {
    const cfg = lConf.fromClient(graph.simulator.controls, newCfg.simControls);
    graph.simulator.setPhysics(cfg);
    graph.simulator.setLocks(cfg);
    graph.renderer.setVisible(cfg);
    if (newCfg.simControls.hasOwnProperty('EdgeBundling')) {
      if (newCfg.simControls.EdgeBundling.hasOwnProperty('edgeBundling')) {
        if (newCfg.simControls.EdgeBundling.edgeBundling) {
          logger.info('Edge bundling turned on. Lock points and edges');
          graph.simulator.controls.locks.interpolateMidPoints = false;
          graph.simulator.controls.locks.lockPoints = true;
          graph.simulator.controls.locks.lockEdges = true;
        }
        if (!newCfg.simControls.EdgeBundling.edgeBundling) {
          logger.info('Edge bundling turned off. Unlock points and edges. Interpolate Midpoints');
          graph.simulator.controls.locks.interpolateMidPoints = true;
          graph.simulator.controls.locks.lockPoints = false;
          graph.simulator.controls.locks.lockEdges = false;
        }
      }
      if (newCfg.simControls.EdgeBundling.hasOwnProperty('midpoints')) {
        graph.simulator.controls.locks.interpolateMidPointsOnce = true;
        graph.simulator.controls.global.numSplits = cfg.EdgeBundling.midpoints;
        graph.dataframe.setNumElements('splits', cfg.EdgeBundling.midpoints);
        graph.simulator.numSplits = cfg.EdgeBundling.midpoints;
        return graph.simulator.setMidEdges();
      }
    }
  }

  // By default return empty promise
  return Q();
}

function setVertices(graph, points) {
  logger.trace('Loading Vertices');

  // This flattens out the points array
  if (!(points instanceof Float32Array)) {
    points = _toTypedArray(points, Float32Array);
  }

  graph.stepNumber = 0;
  return graph.simulator.setPoints(points);
}

// Uint32Array * Array<Array[x,y]> -> Float32Array
function scatterEdgePos(edges, curPos) {
  const res = new Float32Array(edges.length * 2);

  for (let edge = 0; edge < edges.length / 2; edge++) {
    const src = edges[2 * edge];
    const dst = edges[2 * edge + 1];

    res[4 * edge] = curPos[src][0];
    res[4 * edge + 1] = curPos[src][1];
    res[4 * edge + 2] = curPos[dst][0];
    res[4 * edge + 3] = curPos[dst][1];
  }

  return res;
}

const setEdges = Q.promised((graph, edges, points) => {
  logger.trace('Loading Edges');
  if (edges.length < 1) {
    return Q.fcall(() => graph);
  }

  if (!(edges instanceof Uint32Array)) {
    edges = _toTypedArray(edges, Uint32Array);
  }

  logger.debug('Number of edges: %d', edges.length / 2);

  const numPoints = graph.simulator.dataframe.getNumElements('point');

  const edgesFlipped = new Uint32Array(edges.length);
  for (let i = 0; i < edges.length / 2; i++) {
    edgesFlipped[2 * i] = edges[2 * i + 1];
    edgesFlipped[2 * i + 1] = edges[2 * i];
  }

  // const start = Date.now();
  const forwardEdges = graph.dataframe.encapsulateEdges(edges, numPoints);
  const backwardsEdges = graph.dataframe.encapsulateEdges(edgesFlipped, numPoints);
  // console.log('Encapsulates executed in: ', Date.now() - start);

  const degrees = new Uint32Array(numPoints);
  for (let i = 0; i < numPoints; i++) {
    degrees[i] = forwardEdges.degreesTyped[i] + backwardsEdges.degreesTyped[i];
  }

  const nDim = graph.globalControls.dimensions.length;
  const endPoints = scatterEdgePos(edges, points);

  logger.info('Dataset    nodes:%d  edges:%d  splits:%d', numPoints, edges.length);

  return graph.simulator
    .setEdges(edges, forwardEdges, backwardsEdges, degrees, endPoints, points)
    .then(() => {
      // TODO: THESE SHOULDN'T BE HERE
      return graph.simulator.setSelectedPointIndexes(new Uint32Array());
    })
    .then(() => {
      return graph.simulator.setSelectedEdgeIndexes(new Uint32Array());
    })
    .then(() => {
      return graph;
    })
    .fail(log.makeQErrorHandler(logger, 'Failure in setEdges'));
});

function setMidEdgeColors(graph, midEdgeColors) {
  logger.trace('Loading midEdgeColors');

  if (!midEdgeColors) {
    // Use default Colors
    return graph.simulator.setMidEdgeColors(undefined);
  }

  const numMidEdges = graph.simulator.dataframe.getNumElements('midEdges');

  if (midEdgeColors.length !== numMidEdges) {
    logger.error('setMidEdgeColors expects one color per midEdge');
  }

  // Internally we have two colors, one per endpoint.
  const ec = new Uint32Array(numMidEdges * 2);
  for (let i = 0; i < numMidEdges; i++) {
    ec[2 * i] = midEdgeColors[i];
    ec[2 * i + 1] = midEdgeColors[i];
  }

  return graph.simulator.setMidEdgeColors(ec);
}

// Turns an array of vec3's into a Float32Array with ELEMENTS_PER_POINTS values for each element in
// the input array.
function _toTypedArray(array, cons) {
  const floats = new cons(array.length * ELEMENTS_PER_POINTS);

  for (let i = 0; i < array.length; i++) {
    const ii = i * ELEMENTS_PER_POINTS;
    floats[ii + 0] = array[i][0];
    floats[ii + 1] = array[i][1];
  }

  return floats;
}

// graph * {play: bool, layout: bool} -> ()
function tick(graph, cfg) {
  events.fire('tickBegin');
  events.fire('simulateBegin');

  return graph.simulator
    .tick(graph.stepNumber++, cfg)
    .then(() => {
      events.fire('simulateEnd');
      events.fire('renderBegin');

      return graph.renderer.render();
    })
    .then(() => {
      events.fire('renderEnd');
      events.fire('tickEnd');

      return graph;
    });
}

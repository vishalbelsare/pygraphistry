'use strict';

var _ = require('underscore');
var log = require('@graphistry/common').logger;
var logger = log.createLogger('graph-viz', 'graph-viz/js/weaklycc.js');
var perf = require('@graphistry/common').perfStats.createPerfMonitor();

//int -> [ [int, int] ] -> [ [int] ]
var edgesToEdgeList = function(numPoints, edges) {
  perf.startTiming('graph-viz:weaklycc:edgesToEdgeList');
  var edgeList = [];
  for (var i = 0; i < numPoints; i++) {
    edgeList[i] = [];
  }
  edges.forEach(function(pair) {
    edgeList[pair[0]].push(pair[1]);
    edgeList[pair[1]].push(pair[0]);
  });
  perf.endTiming('graph-viz:weaklycc:edgesToEdgeList');
  return edgeList;
};

//int * [ [int] ] -> Uint32Array
var edgesToDegrees = function(numPoints, edgeList) {
  perf.startTiming('graph-viz:weaklycc:edgesToDegrees');
  var degrees = new Uint32Array(numPoints);
  for (var i = 0; i < numPoints; i++) {
    degrees[i] = edgeList[i].length;
  }
  perf.endTiming('graph-viz:weaklycc:edgesToDegrees');
  return degrees;
};

/**
 * Returns all point indexes sorted descending by their degree.
 * @param {Number} numPoints
 * @param {Number[]} degrees
 * @returns {Number[]}
 */
var computeRoots = function(numPoints, degrees) {
  perf.startTiming('graph-viz:weaklycc:computeRoots');
  var roots = new Array(numPoints);
  for (var i = 0; i < numPoints; i++) {
    roots[i] = i;
  }
  roots.sort(function(a, b) {
    return degrees[b] - degrees[a];
  });
  perf.endTiming('graph-viz:weaklycc:edgesToEdgeList');
  return roots;
};

//for node i's !done edge destinations, mark done, add label, and enqueue
// [ [ int ] ] * int * int * Array int -> int
function enqueueEdges(edgeList, label, src, q, done) {
  var edges = edgeList[src];
  for (var i = 0; i < edges.length; i++) {
    var dst = edges[i];
    if (!done[dst]) {
      q.push(dst);
    }
  }
}

//heap-based DFS from root, labeling encountered nodes with 'label' and marking in done array
//TODO: worth cutting search @ some depth in case few clusters?
// [ [ int ] ] * int * int * [ int ]-> int
function traverse(edgeList, root, label, depth, done, nodeToComponent) {
  logger.debug('Starting traversal');
  var traversed = 0;

  //[ int ]
  var roots = [root];

  // This builds the edgeList, but can exhaust the memory heap if not careful.
  // We throw Errors a little aggressively to avoid this.
  for (var level = 0; level < depth && roots.length; level++) {
    var nextLevel = [];
    while (roots.length > 0) {
      var src = roots.pop();
      done[src] = 1;
      nodeToComponent[src] = label;
      enqueueEdges(edgeList, label, src, nextLevel, done);
      traversed++;
    }
    if (nextLevel.length > 50000) {
      throw new Error('Too many roots at the next level; assuming super-nodes.');
    }
    roots = nextLevel;
  }

  return traversed;
}

// Compute undirected weakly connected components
// int * [ [int, int] ] ->
//   {  nodeToComponent: Uint32Array,
//      components: [{root: int, component: int, size: int}]
//   }
module.exports = function weaklycc(numPoints, edges, depth) {
  perf.startTiming('graph-viz:weaklycc:all');

  depth = depth || Number.MAX_VALUE;

  // int -> [ int ]
  var edgeList = edgesToEdgeList(numPoints, edges);

  // [ int ]
  var degrees = edgesToDegrees(numPoints, edgeList);

  // [ int ]
  var roots = computeRoots(numPoints, degrees);

  //{root: int, component: int, size: int}
  var components = [];
  var label = 0;
  var root = roots[0];
  var componentSize = 0;

  var nodeToComponent = new Uint32Array(numPoints);

  perf.startTiming('graph-viz:weaklycc:dfs');

  try {
    if (
      _.reduce(
        edgeList,
        function(accum, e) {
          return accum + e.length;
        },
        0
      ) > 100000
    ) {
      throw new Error('Too much traversal at the current level; assuming super-nodes');
    }
    var lastSize = degrees[roots[0]];
    var threshold = Math.min(lastSize * 0.1, 1000);
    var done = new Uint32Array(numPoints);
    var startTime = process.hrtime();
    for (var i = 0; i < numPoints; i++) {
      root = roots[i];
      if (!done[root]) {
        if (lastSize < threshold) {
          // originally (true && lastSize < threshold), why true && ?

          //skip first as likely super-node
          var defaultLabel = components.length > 1 ? 1 : 0;

          components[defaultLabel].size++;
          done[root] = true;
          nodeToComponent[root] = defaultLabel;
        } else {
          // This tries to fail gracefully under super-node conditions with lots of multi-edges.
          // The alternative is a crash due to memory/heap exhaustion.
          label = components.length;
          componentSize = 0;
          var [s, ns] = process.hrtime(startTime);
          var elapsed = s * 1000 /* s -> ms */ + ns / 1000000 /* ns -> ms */;
          if (elapsed > 2000) {
            logger.warn('weaklycc timeout');
            throw new Error('too long');
          }
          componentSize = traverse(edgeList, root, label, depth, done, nodeToComponent);
          components.push({ root: root, component: label, size: componentSize });
          lastSize = componentSize;

          //cut down for second component (first was a likely outlier)
          if (components.length === 2) {
            threshold = Math.min(lastSize * 0.2, threshold);
          }
        }
      }
    }
  } catch (ignoreMe) {
    // Make one last component out of all remaining nodes.
    componentSize = 0;
    for (var j = 0; j < numPoints; j++) {
      if (nodeToComponent[j] === 0) {
        nodeToComponent[j] = label;
        componentSize++;
      } else if (nodeToComponent[j] === label) {
        // incomplete traverse effect
        componentSize++;
      }
    }
    components.push({ root: root, component: label, size: componentSize });
  }

  perf.endTiming('graph-viz:weaklycc:dfs');
  perf.endTiming('graph-viz:weaklycc:all');

  return {
    //Uint32Array
    nodeToComponent: nodeToComponent,

    //[{root: int, component: int, size: int}]
    components: components
  };
};

'use strict';

var _ = require('underscore');
var debug = require('debug')('graphistry:graph-viz:weaklycc');
var perf = require('common/perfStats.js').createPerfMonitor();



//int -> [ [int, int] ] -> [ [int] ]
var edgesToEdgeList = function (numPoints, edges) {
    perf.startTiming('graph-viz:weaklycc:edgesToEdgeList');
    var edgeList = [];
    for (var i = 0; i < numPoints; i++) {
        edgeList[i] = [];
    }
    edges.forEach(function (pair) {
        edgeList[pair[0]].push(pair[1]);
        edgeList[pair[1]].push(pair[0]);
    });
    perf.endTiming('graph-viz:weaklycc:edgesToEdgeList');
    return edgeList;
};


//int * [ [int] ] -> Uint32Array
var edgesToDegrees = function (numPoints, edgeList) {
    perf.startTiming('graph-viz:weaklycc:edgesToDegrees');
    var degrees = new Uint32Array(numPoints);
    for (var i = 0; i < numPoints; i++) {
        degrees[i] = edgeList[i].length;
    }
    perf.endTiming('graph-viz:weaklycc:edgesToDegrees');
    return degrees;
};


//int * [ int ] -> [int]
var computeRoots = function (numPoints, degrees) {
    perf.startTiming('graph-viz:weaklycc:computeRoots');
    var roots = new Array(numPoints);
    for (var i = 0; i < numPoints; i++) {
        roots[i] = i;
    }
    roots.sort(function (a, b) {
        return degrees[b] - degrees[a];
    });
    perf.endTiming('graph-viz:weaklycc:edgesToEdgeList');
    return roots;
};


//for node i's !done edge destinations, mark done, add label, and enqueue
// [ [ int ] ] * int * int * Array int -> int
function enqueueEdges (edgeList, label, src, q, done) {
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
function traverse (edgeList, root, label, depth, done, nodeToComponent) {

    var traversed = 0;

    //[ int ]
    var roots = [ root ];

    for (var level = 0; level < depth && roots.length; level++) {
        var nextLevel = [];
        while (roots.length > 0) {
            var src = roots.pop();
            done[src] = 1;
            nodeToComponent[src] = label;
            enqueueEdges(edgeList, label, src, nextLevel, done);
            traversed++;
        }
        roots = nextLevel;
    }

    return traversed;
}

// Compute undired weakly connected components
// int * [ [int, int] ] ->
//   {  nodeToComponent: Uint32Array,
//      components: [{root: int, component: int, size: int}]
//   }
module.exports = function weaklycc (numPoints, edges, depth) {

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

    var nodeToComponent = new Uint32Array(numPoints);
    var done = new Uint32Array(numPoints);

    perf.startTiming('graph-viz:weaklycc:dfs');
    var lastSize = degrees[roots[0]];
    var threshold = Math.min(lastSize * 0.1, 1000);
    for (var i = 0; i < numPoints; i++) {
        var root = roots[i];
        if (!done[root]) {
            if (lastSize < threshold) { // originaly (true && lastSize < threshold), why true && ?

                //skip first as likely supernode
                var defC = components.length > 1 ? 1 : 0;

                components[defC].size++;
                done[root] = true;
                nodeToComponent[root] = defC;
            } else {
                var size = traverse(edgeList, root, components.length, depth, done, nodeToComponent);
                components.push({root: root, component: components.length, size: size});
                lastSize = size;

                //cut down for second component (first was a likely outlier)
                if (components.length == 2) {
                    threshold = Math.min(lastSize * 0.2, threshold);
                }
            }
        }
    }

    perf.endTiming('graph-viz:weaklycc:dfs');
    perf.endTiming('graph-viz:weaklycc:all');

    return {
        //Uint32Array
        nodeToComponent: nodeToComponent,

        //[{root: int, component: int, size: int}]
        components: components
    };
}

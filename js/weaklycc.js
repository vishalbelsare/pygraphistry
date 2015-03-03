var _ = require('underscore');
var debug = require("debug")("graphistry:graph-viz:weaklycc");
var perf = require('debug')('perf');
var perfWrapper = require('./util.js').perf.bind('', require("debug")("perf"));



//int -> [ [int, int] ] -> [ [int] ]
var edgesToEdgeList = perfWrapper.bind('', 'edgesToEdgeList',
    function (numPoints, edges) {
        var edgeList = [];
        for (var i = 0; i < numPoints; i++) {
            edgeList[i] = [];
        }
        edges.forEach(function (pair) {
            edgeList[pair[0]].push(pair[1]);
            edgeList[pair[1]].push(pair[0]);
        });
        return edgeList;
    });


//int * [ [int] ] -> Uint32Array
var edgesToDegrees = perfWrapper.bind('', 'edgesToDegrees',
    function (numPoints, edgeList) {

        var degrees = new Uint32Array(numPoints);
        for (var i = 0; i < numPoints; i++) {
            degrees[i] = edgeList[i].length;
        }

        return degrees;
    });


//int * [ int ] -> [int]
var computeRoots = perfWrapper.bind('', 'computeRoots',
    function (numPoints, degrees) {
        var roots = new Array(numPoints);
        for (var i = 0; i < numPoints; i++) {
            roots[i] = i;
        }
        roots.sort(function (a, b) {
            return degrees[b] - degrees[a];
        });
        return roots;
    });


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

    var t0 = Date.now();

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

    var t1 = Date.now();
    for (var i = 0; i < numPoints; i++) {
        var root = roots[i];
        if (!done[root]) {
            var size = traverse(edgeList, root, components.length, depth, done, nodeToComponent);
            components.push({root: root, component: components.length, size: size})
        }
    }
    perf('weaklycc dfs', Date.now() - t1, 'ms');

    perf('weaklycc all', Date.now() - t0, 'ms');

    return {
        //Uint32Array
        nodeToComponent: nodeToComponent,

        //[{root: int, component: int, size: int}]
        components: components
    };
}

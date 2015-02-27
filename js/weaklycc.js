var _ = require('underscore');
var debug = require("debug")("graphistry:graph-viz:weaklycc");

// Compute undired weakly connected components
// int * [ [int, int] ] ->
//   {  nodeToComponent: Uint32Array,
//      components: [{root: int, component: int, size: int}]
//   }
module.exports = function weaklycc (numPoints, edges, depth) {

    depth = depth || Number.MAX_VALUE;


    var nodeToComponent = new Uint32Array(numPoints);
    //{root: int, component: int, size: int}
    var components = [];
    var done = new Uint32Array(numPoints);


    // int -> [ int ]
    var edgeList = [];
    for (var i = 0; i < numPoints; i++) {
        edgeList[i] = [];
    }
    edges.forEach(function (pair) {
        edgeList[pair[0]].push(pair[1]);
        edgeList[pair[1]].push(pair[0]);
    });


    //for node i's !done edge destinations, mark done, add label, and enqueue
    // int * int * Array int -> int
    var enqueueEdges = function (label, src, q) {
        var edges = edgeList[src];
        for (var i = 0; i < edges.length; i++) {
            var dst = edges[i];
            if (!done[dst]) {
                q.push(dst);
            }
        }
    }

    //heap-based DFS from root, labeling encountered nodes with 'label'
    //TODO: worth cutting search @ some depth in case few clusters?
    // int * int -> int
    var traverse = function (root, label) {

        var traversed = 0;

        //[ int ]
        var roots = [ root ];

        for (var level = 0; level < depth && roots.length; level++) {
            var nextLevel = [];
            while (roots.length > 0) {
                var src = roots.pop();
                done[src] = 1;
                nodeToComponent[src] = label;
                enqueueEdges(label, src, nextLevel);
                traversed++;
            }
            roots = nextLevel;
        }

        return traversed;
    };

    //sort roots by degree
    var degrees = new Uint32Array(numPoints);
    for (var i = 0; i < numPoints; i++) {
        degrees[i] = edgeList[i].length;
    }
    var roots = new Array(numPoints);
    for (var i = 0; i < numPoints; i++) {
        roots.push(i);
    }
    roots.sort(function (a, b) {
        return degrees[b] - degrees[a];
    });

    var all0 = Date.now();
    for (var i = 0; i < numPoints; i++) {
        var root = roots[i];
        if (!done[root]) {
            var size = traverse(root, components.length);
            components.push({root: root, component: components.length, size: size})
        }
    }
    debug('weaklycc', Date.now() - all0, 'ms');

    return {
        //Uint32Array
        nodeToComponent: nodeToComponent,

        //[{root: int, component: int, size: int}]
        components: components
    };
}

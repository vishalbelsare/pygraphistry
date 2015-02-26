var debug = require("debug")("graphistry:graph-viz:weaklycc");

// Compute undired weakly connected components
// int * [ [int, int] ] ->
//   {  nodeToComponent: Uint32Array,
//      components: [{root: int, component: int, size: int}]
//   }
module.exports = function weaklycc (numPoints, edges) {

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
        //[ int ]
        var q = [ root ];
        var traversed = 0;

        while (q.length > 0) {
            var src = q.pop();
            done[src] = 1;
            nodeToComponent[src] = label;
            enqueueEdges(label, src, q);
            traversed++;
        }

        return traversed;
    };

    var all0 = Date.now();
    for (var i = 0; i < numPoints; i++) {
        if (!done[i]) {
            var size = traverse(i, components.length);
            components.push({root: i, component: components.length, size: size})
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

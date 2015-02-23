"use strict";

var Q = require('q');
var glMatrix = require('gl-matrix');
var events = require('./SimpleEvents.js');
var _ = require('underscore');
var debug = require("debug")("graphistry:graph-viz:graph:nbody");
var util = require('./util.js');

var ELEMENTS_PER_POINTS = 2;

var NAMED_CLGL_BUFFERS = require('./buffers.js').NAMED_CLGL_BUFFERS;


//for each named_clgl_buffer, its setter
var boundBuffers = {};

/**
 * Create a new N-body graph and return a promise for the graph object
 *
 * @param simulator - the module of the simulator backend to use
 * @param renderer - the module of the rendering backend to use
 * @param document - parent document DOM
 * @param canvas - the canvas DOM element to draw the graph in
 * @param bgColor - [0--255,0--255,0--255,0--1]
 * @param [dimensions=\[1,1\]] - a two element array [width,height] used for internal posituin calculations.
 */
function create(renderer, dimensions, numSplits, simulationTime) {

    var graph = {
        renderer: renderer,
        simulator: undefined,
        stepNumber: 0,
        dimensions: dimensions,
        numSplits: numSplits,
        simulationTime: simulationTime
    };

    _.each({
        initSimulation: initSimulation,
        setPoints: setPoints,
        setVertices: setVertices,
        setLabels: setLabels,
        setEdges: setEdges,
        setEdgesAndColors: setEdgesAndColors,
        setEdgeColors: setEdgeColors,
        setMidEdgeColors: setMidEdgeColors,
        setLocked: setLocked,
        setColorMap: setColorMap,
        tick: tick,
        updateSettings: updateSettings
    }, function (setter, setterName) {
        graph[setterName] = setter.bind('', graph);
    });

    _.each(NAMED_CLGL_BUFFERS, function (cfg, name) {
        graph[cfg.setterName] = boundBuffers[name].setter.bind('', graph);
    });

    return graph;
}

function initSimulation(graph, device, vendor, cfg) {
    debug('Creating Simulator')
    var simulator = cfg[0].simulator;

    return simulator.create(graph.renderer, graph.dimensions, graph.numSplits,
                            device, vendor, cfg)
        .then(function(sim) {
            debug("Created simulator");
            graph.simulator = sim;
            return graph;
        }).fail(function (err) {
            console.error("ERROR Cannot create simulator. ", (err||{}).stack)
        });
}

function updateSettings (graph, cfg) {
    debug('Updating simulation settings, %o', cfg);
    if (cfg.simControls) {
        graph.simulator.setPhysics(cfg.simControls);
        graph.simulator.setLocked(cfg.simControls);
        graph.renderer.setVisible(cfg.simControls);
    }

    if (cfg.timeSubset) {
        graph.simulator.setTimeSubset(cfg.timeSubset);
    }

    // Since moving nodes implies running an opencl kernel, return
    // a promise fulfilled when moving is done.
    if (cfg.marquee) {
        return graph.simulator.moveNodes(cfg.marquee);
    } else {
        return Q();
    }
}



function passthroughSetter(simulator, dimName, arr, passthrough) {
        simulator[passthrough](arr, true);
        if (dimName == 'numEdges') {
            simulator[passthrough](arr, false);
        }
}

//str * TypedArrayConstructor * {'numPoints', 'numEdges'} * {'set...'} * 'a
//  -> simulator -> Q simulator
//Create default setter
function makeDefaultSetter (name, arrConstructor, dimName, passthrough, v) {
    return function (simulator) {
        debug("Using default %s", name);
        var elts = simulator[dimName];
        var arr = new arrConstructor(elts);
        if (v) {
            for (var i = 0; i < elts; i++)
                arr[i] = v;
        }
        passthroughSetter(simulator, dimName, arr, passthrough);
    };
}

function makeSetter (name, defSetter, arrConstructor, dimName, passthrough) {

    return function (graph, rawArr) {

        debug('Loading %s', name);

        if (!rawArr) {
            return defSetter(graph.simulator);
        }

        var arr;
        if (rawArr.constructor == arrConstructor && dimName == 'numPoints') {
            arr = rawArr;
        } else if (dimName == 'numEdges') {
            var len = graph.simulator[dimName];
            arr = new arrConstructor(len);
            var map = graph.simulator.bufferHostCopies.forwardsEdges.edgePermutation;
            for (var i = 0; i < len; i++) {
                arr[map[i]] = rawArr[i];
            }
        }else {
            var len = graph.simulator[dimName];
            arr = new arrConstructor(len);
            for (var i = 0; i < len; i++) {
                arr[i] = rawArr[i];
            }
        }

        passthroughSetter(graph.simulator, dimName, arr, passthrough);

    };
}

//Create stock setters
//other setters may use, must do here
_.each(NAMED_CLGL_BUFFERS, function (cfg, name) {
    var defaultSetter = makeDefaultSetter(name, cfg.arrType, cfg.dims, cfg.setterName, cfg.defV);
    var setter = makeSetter(name, defaultSetter, cfg.arrType, cfg.dims, cfg.setterName);
    boundBuffers[name] = {setter: setter}
});


// TODO Deprecate and remove. Left for Uber compatibitily
function setPoints(graph, points, pointSizes, pointColors) {
    // FIXME: If there is already data loaded, we should to free it before loading new data
    return setVertices(graph, points)
    .then(function (simulator) {
        if (pointSizes) {
            return boundBuffers.pointSizes.setter(graph, pointSizes);
        }  else {
            //set after edges, in order to incorporate edge structure
        }

    }).then(function (simulator) {
        if (pointColors) {
            return boundBuffers.pointColors.setter(graph, pointColors);
        } else {
            //set after edges, in order to incorporate edge structure
        }
    })
    .then(function() {
        return graph;
    }).fail(function (err) {
        console.error("ERROR Failure in NBody.setPoints ", (err||{}).stack);
    });
}

function setVertices(graph, points) {
    debug("Loading Vertices")

    // This flattens out the points array
    if(!(points instanceof Float32Array)) {
        points = _toTypedArray(points, Float32Array);
    }

    graph.__pointsHostBuffer = points;

    graph.stepNumber = 0;
    return graph.simulator.setPoints(points)
}


// TODO Deprecate and remove. Left for Uber compatibility
function setEdgesAndColors(graph, edges, edgeColors) {
    return setEdges(graph, edges)
    .then(function () {
        setMidEdgeColors(graph, edgeColors)
    });
}

var setEdges = Q.promised(function(graph, edges) {
    debug("Loading Edges")
    if (edges.length < 1)
        return Q.fcall(function() { return graph; });

    if (!(edges instanceof Uint32Array)) {
        edges = _toTypedArray(edges, Uint32Array);
    }

    debug("Number of edges: %d", edges.length / 2)

    //FIXME THIS SHOULD WORK BUT CRASHES SAFARI
    var encapsulate = function (edges) {

        //[[src idx, dest idx]]
        var edgeList = new Array(edges.length / 2);
        for (var i = 0; i < edges.length/2; i++) {
            edgeList[i] = [edges[2 * i], edges[2 * i + 1]];
            edgeList[i].original = i;
        }

        //sort by src idx
        edgeList.sort(function(a, b) {
            return a[0] < b[0] ? -1
                : a[0] > b[0] ? 1
                : a[1] - b[1];
        });

        var edgePermutationTyped = new Uint32Array(edgeList.length);
        var edgePermutationInverseTyped = new Uint32Array(edgeList.length);
        edgeList.forEach(function (edge, i) {
            edgePermutationTyped[edge.original] = i;
            edgePermutationInverseTyped[i] = edge.original;
        })

        //[ [first edge number from src idx, numEdges from source idx, source idx], ... ]
        var workItems = [[0, 0, edgeList[0][0]]];
        var sourceHasEdge = [];
        _.each(_.range(graph.simulator.numPoints), function () {
            sourceHasEdge.push(false);
        });
        edgeList.forEach(function (edge, i) {
            sourceHasEdge[edge[0]] = true;
        });
        edgeList.forEach(function (edge, i) {
            var prev = workItems[workItems.length - 1];
            if(edge[0] == prev[2]) {
                prev[1]++;
            } else {
                workItems.push([i, 1, edge[0]])
            }
        });
        _.each(sourceHasEdge, function (hasEdge, src) {
            if (!hasEdge)
                workItems.push([-1, 0, src]);
        });
        //keep items contiguous to filter based on them
        workItems.sort(function (a, b) {
            return a[2] < b[2] ? -1
                : a[2] > b[2] ? 1
                : 0;
        });

        //DISABLED: keeping ordered to streamline time-based filtering
        /*
        //Cheesey load balancing: sort by size
        //TODO benchmark
        workItems.sort(function (edgeList1, edgeList2) {
            return edgeList1[1] - edgeList2[1];
        });
        */

        var degreesTyped = new Uint32Array(graph.simulator.numPoints);
        var srcToWorkItem = new Int32Array(graph.simulator.numPoints);
        workItems.forEach(function (edgeList, idx) {
            srcToWorkItem[edgeList[2]] = idx;
            degreesTyped[edgeList[2]] = edgeList[1];
        });

        //Uint32Array [first edge number from src idx, number of edges from src idx, src idx, 666]
        //fetch edge to find src and dst idx (all src same)
        //num edges > 0
        var workItemsTyped = new Int32Array(
            _.flatten(
                workItems.map(function (o) {
                    return [o[0], o[1], o[2], 666];
                })
            )
        );

        var edgesTyped = new Uint32Array(_.flatten(edgeList));

        return {
            //Uint32Array
            degreesTyped: degreesTyped,

            //Uint32Array [(srcIdx, dstIdx), ...]
            //(edges ordered by src idx)
            edgesTyped: edgesTyped,

            //Uint32Array [where unsorted edge now sits]
            edgePermutation: edgePermutationTyped,

            //Uint32Array [where sorted edge used to it]
            edgePermutationInverseTyped: edgePermutationInverseTyped,

            //Uint32Array [(edge number, number of sibling edges), ... ]
            numWorkItems: workItemsTyped.length,

            //Int32Array [(first edge number, number of sibling edges)]
            workItemsTyped: workItemsTyped,

            //Uint32Array [workitem number node belongs to]
            srcToWorkItem: srcToWorkItem
        };
    }

    var edgesFlipped = new Uint32Array(edges.length);
    for (var i = 0; i < edges.length/2; i++) {
        edgesFlipped[2 * i] = edges[2 * i + 1];
        edgesFlipped[2 * i + 1] = edges[2 * i];
    }

    var forwardEdges = encapsulate(edges);
    var backwardsEdges = encapsulate(edgesFlipped);

    var degrees = new Uint32Array(graph.simulator.numPoints);
    for (var i = 0; i < graph.simulator.numPoints; i++) {
        degrees[i] = forwardEdges.degreesTyped[i] + backwardsEdges.degreesTyped[i];
    }

    var nDim = graph.dimensions.length;
    var midPoints = new Float32Array((edges.length / 2) * graph.numSplits * nDim || 1);
    if (graph.numSplits) {
        for (var i = 0; i < edges.length; i+=2) {
            var src = edges[i];
            var dst = edges[i + 1];
            for (var d = 0; d < nDim; d++) {
                var start = graph.__pointsHostBuffer[src * nDim + d];
                var end = graph.__pointsHostBuffer[dst * nDim + d];
                var step = (end - start) / (graph.numSplits + 1);
                for (var q = 0; q < graph.numSplits; q++) {
                    midPoints[(i * graph.numSplits + q) * nDim + d] = start + step * (q + 1);
                }
            }
        }
    }
    debug("Number of control points, splits: %d, %d", edges.length * graph.numSplits, graph.numSplits);

    return graph.simulator.setEdges(forwardEdges, backwardsEdges, degrees, midPoints)
    .then(function() {
        return graph;
    }).fail(function (err) {
        console.error("ERROR Failure in NBody.setEdges ", (err||{}).stack);
    });
});

function setEdgeColors(graph, edgeColors) {
    debug("Loading edgeColors");
    var nedges = graph.simulator.numEdges;

    if (!edgeColors) // Use default Colors
        return graph.simulator.setEdgeColors(undefined);

    if (edgeColors.length != nedges)
       console.error("ERROR: setEdgeColors expects one color per edge.");

    // Internaly we have two colors, one per endpoint.
    // Edges may be permuted, use forward permutation


    var ec = new Uint32Array(nedges * 2);
    var map = graph.simulator.bufferHostCopies.forwardsEdges.edgePermutation;
    for (var edge = 0; edge < nedges; edge++) {
        var spot = 2 * map[edge];
        ec[spot] = edgeColors[edge];
        ec[spot + 1] = edgeColors[edge];
    }

    return graph.simulator.setEdgeColors(ec);
}

function setMidEdgeColors(graph, midEdgeColors) {
    debug("Loading midEdgeColors");

    var numMidEdges = graph.simulator.numMidEdges;

    if (midEdgeColors.length != numMidEdges)
       console.error("ERROR: setMidEdgeColors expects one color per midEdge.");

    // Internaly we have two colors, one per endpoint.
    var ec = new Uint32Array(numMidEdges * 2);
    for (var i = 0; i < numMidEdges; i++) {
        ec[2*i] = midEdgeColors[i];
        ec[2*i + 1] = midEdgeColors[i];
    }

    return graph.simulator.setMidEdgeColors(ec);
}

function setLabels(graph, pointLabels) {
    debug('setLabels', pointLabels ? pointLabels.length : 'none');
    return graph.simulator.setLabels(pointLabels);
}

function setLocked(graph, opts) {
    //TODO reset step number?
    graph.simulator.setLocked(opts);
}


function setColorMap(graph, imageURL, maybeClusters) {
    return graph.renderer.setColorMap(imageURL, maybeClusters)
        .then(_.constant(graph));
}


// Turns an array of vec3's into a Float32Array with ELEMENTS_PER_POINTS values for each element in
// the input array.
function _toTypedArray(array, cons) {
    var floats = new cons(array.length * ELEMENTS_PER_POINTS);

    for(var i = 0; i < array.length; i++) {
        var ii = i * ELEMENTS_PER_POINTS;
        floats[ii + 0] = array[i][0];
        floats[ii + 1] = array[i][1];
    }

    return floats;
}


//graph * {play: bool, layout: bool} -> ()
function tick(graph, cfg) {
    events.fire("tickBegin");
    events.fire("simulateBegin");

    return graph.simulator.tick(graph.stepNumber++, cfg)
    .then(function() {
        events.fire("simulateEnd");
        events.fire("renderBegin");

        return graph.renderer.render();
    })
    .then(function() {
        events.fire("renderEnd");
        events.fire("tickEnd");

        return graph;
    });
}


module.exports = {create: create};

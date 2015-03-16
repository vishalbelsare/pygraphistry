"use strict";

var Q = require('q');
var glMatrix = require('gl-matrix');
var lConf = require('./layout.config.js');
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
function create(renderer, device, vendor, controls) {

    var graph = {
        renderer: renderer,
        stepNumber: 0,
        __pointsHostBuffer: undefined
    };

    _.each({
        setPoints: setPoints,
        setVertices: setVertices,
        setLabels: setLabels,
        setEdges: setEdges,
        setEdgesAndColors: setEdgesAndColors,
        setEdgeColors: setEdgeColors,
        setMidEdgeColors: setMidEdgeColors,
        setColorMap: setColorMap,
        tick: tick,
        updateSettings: updateSettings
    }, function (setter, setterName) {
        graph[setterName] = setter.bind('', graph);
    });

    _.each(NAMED_CLGL_BUFFERS, function (cfg, name) {
        graph[cfg.setterName] = boundBuffers[name].setter.bind('', graph);
    });

    return createSimulator(renderer, device, vendor, controls).then(function (simulator) {
        graph.simulator = simulator;
        graph.globalControls = simulator.controls.global;
    }).then(function () {
        Object.seal(graph);
        return graph;
    }).fail(util.makeErrorHandler('Cannot initialize nbody'));
}

function createSimulator(renderer, device, vendor, controls) {
    debug('Creating Simulator')

    // Hack, but making simulator depend on CL device it not worth the work.
    var simulator = controls[0].simulator;

    return simulator.create(renderer, device, vendor, controls)
        .fail(util.makeErrorHandler('Cannot create simulator'));
}

function updateSettings (graph, newCfg) {
    debug('Updating simulation settings', newCfg);
    if (newCfg.simControls) {
        var cfg = lConf.fromClient(graph.simulator.controls, newCfg.simControls);
        graph.simulator.setPhysics(cfg);
        graph.simulator.setLocks(cfg);
        graph.renderer.setVisible(cfg);
    }

    if (newCfg.timeSubset) {
        graph.simulator.setTimeSubset(newCfg.timeSubset);
    }

    // Since moving nodes implies running an opencl kernel, return
    // a promise fulfilled when moving is done.
    if (newCfg.marquee) {
        return graph.simulator.moveNodes(newCfg.marquee);
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

//str * TypedArrayConstructor * {'numPoints', 'numEdges'} * {'set...'} * ?(simulator * array * len -> ())
//  -> simulator -> Q simulator
//Create default setter
function makeDefaultSetter (name, arrConstructor, dimName, passthrough, f) {
    return function (simulator) {
        debug("Using default %s", name);
        var elts = simulator[dimName];
        var arr = new arrConstructor(elts);
        if (f) {
            f(simulator, arr, elts);
        }
        return passthroughSetter(simulator, dimName, arr, passthrough);
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

        return passthroughSetter(graph.simulator, dimName, arr, passthrough);

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

    debug('setPoints (DEPRECATED)');

    // FIXME: If there is already data loaded, we should to free it before loading new data
    return setVertices(graph, points)
    .then(function (simulator) {
        if (pointSizes) {
            return boundBuffers.setSizes.setter(graph, pointSizes);
        } else {
            debug('no point sizes, deferring');
        }

    }).then(function (simulator) {
        if (pointColors) {
            return boundBuffers.setColors.setter(graph, pointColors);
        } else {
            debug('no point colors, deferring');
        }
    })
    .then(function() {
        return graph;
    }).fail(util.makeErrorHandler('Failure in setPoints'));
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
        return setMidEdgeColors(graph, edgeColors);
    });
}


// Uint32Array * Float32Array -> Float32Array
function scatterEdgePos(edges, curPos) {
    var res = new Float32Array(edges.length * 2);

    for (var edge = 0; edge < edges.length/2; edge++) {
        var src = edges[2 * edge];
        var dst = edges[2 * edge + 1];

        res[4 * edge] = curPos[2 * src];
        res[4 * edge + 1] = curPos[2 * src + 1];
        res[4 * edge + 2] = curPos[2 * dst];
        res[4 * edge + 3] = curPos[2 * dst + 1];
    }

    return res;
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

        //workItemsTyped is a Uint32Array [first edge number from src idx, number of edges from src idx, src idx, 666]
        //fetch edge to find src and dst idx (all src same)
        //num edges > 0

        // Without Underscore and with preallocation. Less clear than a flatten + map, but better perf.
        var workItemsTyped = new Int32Array(workItems.length * 4);
        for (var idx = 0; idx < workItems.length ; idx++) {
            workItemsTyped[idx*4] = workItems[idx][0];
            workItemsTyped[idx*4 + 1] = workItems[idx][1];
            workItemsTyped[idx*4 + 2] = workItems[idx][2];
            workItemsTyped[idx*4 + 3] = 666;
        }

        // Without Underscore and with preallocation. Less clear than a flatten, but better perf.
        // var edgesTyped = new Uint32Array(_.flatten(edgeList));
        var edgesTyped = new Uint32Array(edgeList.length * 2);
        for (var idx = 0; idx < edgeList.length; idx++) {
            edgesTyped[idx*2] = edgeList[idx][0];
            edgesTyped[idx*2 + 1] = edgeList[idx][1];
        }


        var index = 0;
        var edgeStartEndIdxs = [];
        for(var i = 0; i < workItems.length - 1; i++) {
          var start = workItems[i][0];
          if (start == -1) {
            edgeStartEndIdxs.push([-1, -1]);
          } else {
            var end = workItems[i+1][0];
            var j = i+1;
            while (end < 0 && ((j + 1)< workItems.length)) {
              end = workItems[j + 1][0];
              j = j + 1;
            }
            edgeStartEndIdxs.push([start, end]);
          }
        }
        if (workItems[workItems.length - 1][0] != -1) {
        edgeStartEndIdxs.push([workItems[workItems.length - 1][0], edges.length /2]);
        } else {
          edgeStartEndIdxs.push([-1, -1]);
        }

        // Flattening
        var edgeStartEndIdxsTyped = new Uint32Array(edgeStartEndIdxs.length * 2);
        for (var idx = 0; idx < edgeStartEndIdxs.length; idx++) {
            edgeStartEndIdxsTyped[idx*2] = edgeStartEndIdxs[idx][0];
            edgeStartEndIdxsTyped[idx*2 + 1] = edgeStartEndIdxs[idx][1];
        }

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
            srcToWorkItem: srcToWorkItem,

            edgeStartEndIdxsTyped: edgeStartEndIdxsTyped
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

    var nDim = graph.globalControls.dimensions.length;
    var numSplits = graph.globalControls.numSplits;
    var midPoints = new Float32Array((edges.length / 2) * numSplits * nDim || 1);
    if (numSplits) {
        for (var i = 0; i < edges.length; i+=2) {
            var src = edges[i];
            var dst = edges[i + 1];
            for (var d = 0; d < nDim; d++) {
                var start = graph.__pointsHostBuffer[src * nDim + d];
                var end = graph.__pointsHostBuffer[dst * nDim + d];
                var step = (end - start) / (numSplits + 1);
                for (var q = 0; q < numSplits; q++) {
                    midPoints[((i/2) * numSplits + q) * nDim + d] = start + step * (q + 1);
                }
            }
        }
    }

    var endPoints = scatterEdgePos(edges, graph.__pointsHostBuffer);

    console.info('Dataset    nodes:%d  edges:%d  splits:%d',
                graph.simulator.numPoints, edges.length, numSplits);

    return graph.simulator.setEdges(forwardEdges, backwardsEdges, degrees, midPoints, endPoints)
    .then(function() {
        return graph;
    }).fail(util.makeErrorHandler('Failure in setEdges'));
});

function setEdgeColors(graph, edgeColors) {
    debug("Loading edgeColors");
    var nedges = graph.simulator.numEdges;

    if (!edgeColors) // Use default Colors
        return graph.simulator.setEdgeColors(undefined);

    if (edgeColors.length != nedges)
       util.error('setEdgeColors expects one color per edge');

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
       util.error('setMidEdgeColors expects one color per midEdge');

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

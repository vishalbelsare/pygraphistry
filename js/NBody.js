"use strict";

var Q = require('q');
var glMatrix = require('gl-matrix');
var lConf = require('./layout.config.js');
var events = require('./SimpleEvents.js');
var _ = require('underscore');
var Dataframe = require('./Dataframe.js');

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz:graph-viz:graph:nbody');

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

    var dataframe = new Dataframe();

    var graph = {
        renderer: renderer,
        stepNumber: 0,
        __pointsHostBuffer: undefined,
        dataframe: dataframe
    };

    _.each({
        setPoints: setPoints,
        setVertices: setVertices,
        setPointLabels: setPointLabels,
        setEdgeLabels: setEdgeLabels,
        setEdges: setEdges,
        setEdgesAndColors: setEdgesAndColors,
        setEdgeColors: setEdgeColors,
        setEdgeWeight: setEdgeWeight,
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

    return createSimulator(dataframe, renderer, device, vendor, controls).then(function (simulator) {
        graph.simulator = simulator;
        graph.globalControls = simulator.controls.global;
    }).then(function () {
        Object.seal(graph);
        return graph;
    }).fail(log.makeQErrorHandler(logger, 'Cannot initialize nbody'));
}

function createSimulator(dataframe, renderer, device, vendor, controls) {
    logger.trace('Creating Simulator')

    // Hack, but making simulator depend on CL device it not worth the work.
    var simulator = controls[0].simulator;

    return simulator.create(dataframe, renderer, device, vendor, controls)
        .fail(log.makeQErrorHandler(logger, 'Cannot create simulator'));
}

function updateSettings(graph, newCfg) {
    logger.debug('Updating simulation settings', newCfg);
    if (newCfg.simControls) {
        var cfg = lConf.fromClient(graph.simulator.controls, newCfg.simControls);
        graph.simulator.setPhysics(cfg);
        graph.simulator.setLocks(cfg);
        graph.renderer.setVisible(cfg);
        if (newCfg.simControls.hasOwnProperty('EdgeBundling')) {
            if (newCfg.simControls.EdgeBundling.hasOwnProperty('edgeBundling')) {
                if (newCfg.simControls.EdgeBundling.edgeBundling) {
                    logger.info("Edge bundling turned on. Lock points and edges");
                    graph.simulator.controls.locks.interpolateMidPoints = false;
                    graph.simulator.controls.locks.lockPoints = true;
                    graph.simulator.controls.locks.lockEdges = true;
                }
                if (!newCfg.simControls.EdgeBundling.edgeBundling) {
                    logger.info("Edge bundling turned off. Unlock points and edges. Interpolate Midpoints");
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
        logger.trace("Using default %s", name);
        var elts = simulator.dataframe.getNumElements(dimName);
        var arr = new arrConstructor(elts);
        if (f) {
            f(simulator, arr, elts);
        }
        return passthroughSetter(simulator, dimName, arr, passthrough);
    };
}


function makeSetter (name, defSetter, arrConstructor, dimName, passthrough) {

    return function (graph, rawArr) {

        logger.trace('Loading %s', name);

        if (!rawArr) {
            return defSetter(graph.simulator);
        }

        // TODO: Decide if the following setters are still relevant.
        var arr;
        if (rawArr.constructor == arrConstructor && dimName == 'point') {
            arr = rawArr;
        } else if (dimName == 'edge') {
            var len = graph.simulator.dataframe.getNumElements(dimName);
            arr = new arrConstructor(len);
            var map = graph.simulator.dataframe.getHostBuffer('forwardsEdges').edgePermutation;
            for (var i = 0; i < len; i++) {
                arr[map[i]] = rawArr[i];
            }
        }else {
            var len = graph.simulator.dataframe.getNumElements(dimName);
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
    logger.trace('setPoints (DEPRECATED)');

    // FIXME: If there is already data loaded, we should to free it before loading new data
    return setVertices(graph, points)
    .then(function (simulator) {
        if (pointSizes) {
            return boundBuffers.setSizes.setter(graph, pointSizes);
        } else {
            logger.trace('no point sizes, deferring');
        }

    }).then(function (simulator) {
        if (pointColors) {
            return boundBuffers.setColors.setter(graph, pointColors);
        } else {
            logger.trace('no point colors, deferring');
        }
    })
    .then(function() {
        return graph;
    }).fail(log.makeQErrorHandler(logger, 'Failure in setPoints'));
}

function setVertices(graph, points) {
    logger.trace('Loading Vertices');

    // This flattens out the points array
    if(!(points instanceof Float32Array)) {
        points = _toTypedArray(points, Float32Array);
    }

    graph.__pointsHostBuffer = points;
    graph.dataframe.loadHostBuffer('points', points);

    graph.stepNumber = 0;
    return graph.simulator.setPoints(points);
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
    logger.trace('Loading Edges');
    if (edges.length < 1)
        return Q.fcall(function() { return graph; });

    if (!(edges instanceof Uint32Array)) {
        edges = _toTypedArray(edges, Uint32Array);
    }

    logger.debug('Number of edges: %d', edges.length / 2);

    var numPoints = graph.simulator.dataframe.getNumElements('point');

    var edgesFlipped = new Uint32Array(edges.length);
    for (var i = 0; i < edges.length/2; i++) {
        edgesFlipped[2 * i] = edges[2 * i + 1];
        edgesFlipped[2 * i + 1] = edges[2 * i];
    }

    // var start = Date.now();
    var forwardEdges = graph.dataframe.encapsulateEdges(edges, numPoints);
    var backwardsEdges = graph.dataframe.encapsulateEdges(edgesFlipped, numPoints);
    // console.log('Encapsulates executed in: ', Date.now() - start);

    var degrees = new Uint32Array(numPoints);
    for (var i = 0; i < numPoints; i++) {
        degrees[i] = forwardEdges.degreesTyped[i] + backwardsEdges.degreesTyped[i];
    }

    var nDim = graph.globalControls.dimensions.length;
    var numSplits = graph.globalControls.numSplits;
    var midPoints = new Float32Array((edges.length / 2) * numSplits * nDim || 1);
    if (numSplits) {
        for (var i = 0; i < edges.length; i+=2) {
            var src = forwardEdges.edgesTyped[i];
            var dst = forwardEdges.edgesTyped[i + 1];
            for (var d = 0; d < nDim; d++) {
                var start = graph.__pointsHostBuffer[(src * nDim) + d];
                var end = graph.__pointsHostBuffer[(dst * nDim) + d];
                var step = (end - start) / (numSplits + 1);
                for (var q = 0; q < numSplits; q++) {
                    midPoints[((((i/2) * numSplits) + q) * nDim) + d] = start + step * (q + 1);
                }
            }
        }
    }

    var endPoints = scatterEdgePos(edges, graph.__pointsHostBuffer);

    logger.info('Dataset    nodes:%d  edges:%d  splits:%d',
                numPoints, edges.length, numSplits);

    return graph.simulator.setEdges(edges, forwardEdges, backwardsEdges,
                                    degrees, midPoints, endPoints, graph.__pointsHostBuffer)
        .then(function() {
            return graph;
        }).fail(log.makeQErrorHandler(logger, 'Failure in setEdges'));
});

function setEdgeColors(graph, edgeColors) {
    logger.trace('Loading edgeColors');
    var nedges = graph.simulator.dataframe.getNumElements('edge');

    if (!edgeColors) // Use default Colors
        return graph.simulator.setEdgeColors(undefined);

    if (edgeColors.length != nedges)
       logger.error('setEdgeColors expects one color per edge');

    // Internaly we have two colors, one per endpoint.
    // Edges may be permuted, use forward permutation


    var ec = new Uint32Array(nedges * 2);
    var map = graph.simulator.dataframe.getHostBuffer('forwardsEdges').edgePermutation;
    for (var edge = 0; edge < nedges; edge++) {
        var spot = 2 * map[edge];
        ec[spot] = edgeColors[edge];
        ec[spot + 1] = edgeColors[edge];
    }

    return graph.simulator.setEdgeColors(ec);
}

function setEdgeWeight(graph, edgeWeights) {
    logger.trace('Loading edgeColors');
    var nedges = graph.simulator.dataframe.getNumElements('edge');

    if (!edgeWeights) {
      return graph.simulator.setEdgeWeight(undefined);
    }


    if (edgeWeights.length != nedges)
       logger.error('setEdgeWeigts expects one weight per edge');

    // Internaly we have two weights, one per endpoint.
    // Edges may be permuted, use forward permutation

    var ew = new Float32Array(nedges * 2);
    var map = graph.simulator.dataframe.getHostBuffer('forwardsEdges').edgePermutation;
    for (var edge = 0; edge < nedges; edge++) {
        var spot = 2 * map[edge];
        ew[spot] = edgeWeights[edge];
        ew[spot + 1] = edgeWeights[edge];
    }

    return graph.simulator.setEdgeWeight(ew);
}

function setMidEdgeColors(graph, midEdgeColors) {
    logger.trace("Loading midEdgeColors");

    if (!midEdgeColors) { // Use default Colors
        return graph.simulator.setMidEdgeColors(undefined);
    }

    var numMidEdges = graph.simulator.dataframe.getNumElements('midEdges');

    if (midEdgeColors.length != numMidEdges)
       logger.error('setMidEdgeColors expects one color per midEdge');

    // Internaly we have two colors, one per endpoint.
    var ec = new Uint32Array(numMidEdges * 2);
    for (var i = 0; i < numMidEdges; i++) {
        ec[2*i] = midEdgeColors[i];
        ec[2*i + 1] = midEdgeColors[i];
    }

    return graph.simulator.setMidEdgeColors(ec);
}

function setPointLabels(graph, pointLabels) {
    logger.trace('setPointLabels', pointLabels ? pointLabels.length : 'none');
    return graph.simulator.setPointLabels(pointLabels);
}


function setEdgeLabels(graph, edgeLabels) {
    logger.trace('setEdgeLabels', edgeLabels ? edgeLabels.length : 'none');
    return graph.simulator.setEdgeLabels(edgeLabels);
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
    events.fire('tickBegin');
    events.fire('simulateBegin');

    return graph.simulator.tick(graph.stepNumber++, cfg)
    .then(function() {
        events.fire('simulateEnd');
        events.fire('renderBegin');

        return graph.renderer.render();
    })
    .then(function() {
        events.fire('renderEnd');
        events.fire('tickEnd');

        return graph;
    });
}


module.exports = {
    create: create
};

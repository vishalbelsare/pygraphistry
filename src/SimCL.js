'use strict';

var _ = require('underscore');
var Q = require('q');
var sprintf = require('sprintf-js').sprintf;
var dijkstra = require('dijkstra');
var util = require('./util.js');
var MoveNodes = require('./moveNodes.js');
var SelectNodesInRect = require('./SelectNodesInRect.js');
var SelectNodesInCircle = require('./SelectNodesInCircle.js');

var HistogramKernel = require('./histogramKernel.js');
var Color = require('color');

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz','graph-viz/js/SimCL.js');

//var webcl = require('node-webcl');

// Do NOT enable this in prod. It destroys performance.
// Seriously.
// Q.longStackSupport = true;
var randLength = 73;

export function createSync(dataframe, renderer, cl, device, vendor, cfg) {

    // Pick the first layout algorithm that matches our device type
    var type, // GPU device type
        availableControls, // Available controls for device type
        controls,
        layoutAlgorithms,
        simObj;

    type = cl.deviceProps.TYPE.trim();

    availableControls = _.filter(cfg, function (algo) {
        return _.contains(algo.devices, type);
    });

    if (availableControls.length === 0) {
        logger.die('No layout controls satisfying device/vendor requirements', device, vendor);
    }

    controls = availableControls[0];
    layoutAlgorithms = controls.layoutAlgorithms;

    simObj = {
        renderer: renderer,
        cl: cl,
        elementsPerPoint: 2,
        versions: {
            tick: 0,
            buffers: { }
        },
        controls: controls,
        dataframe: dataframe
    };

    // Give dataframe pointer to simObj
    dataframe.simulator = simObj;

    logger.debug({layoutAlgorithms: layoutAlgorithms}, 'Instantiating layout algorithms');

    const algos = _.map(layoutAlgorithms, function (la) {
        var algo = new la.algo(cl);
        algo.setPhysics(_.object(_.map(la.params, function (p, name) {
            return [name, p.value];
        })));
        return algo;
    });

    logger.trace("Creating SimCL...");

    simObj.layoutAlgorithms = algos;
    simObj.otherKernels = {
        moveNodes: new MoveNodes(cl),
        selectNodesInRect: new SelectNodesInRect(cl),
        selectNodesInCircle: new SelectNodesInCircle(cl)
        //histogramKernel: new HistogramKernel(cl),
    };
    simObj.tilesPerIteration = 1;
    simObj.buffersLocal = {};
    createSetters(simObj);

    simObj.tick = tick.bind(this, simObj);
    simObj.setPoints = setPoints.bind(this, simObj);
    simObj.setEdges = setEdges.bind(this, renderer, simObj);
    simObj.setSelectedPointIndexes = setSelectedPointIndexes.bind(this, simObj);
    simObj.setSelectedEdgeIndexes = setSelectedEdgeIndexes.bind(this, simObj);
    simObj.setMidEdgeColors = setMidEdgeColors.bind(this, simObj);
    simObj.setLocks = setLocks.bind(this, simObj);
    simObj.setPhysics = setPhysics.bind(this, simObj);
    simObj.moveNodes = moveNodes.bind(this, simObj);
    simObj.selectNodesInRect = selectNodesInRect.bind(this, simObj);
    simObj.selectNodesInCircle = selectNodesInCircle.bind(this, simObj);
    simObj.connectedEdges = connectedEdges.bind(this, simObj);
    simObj.resetBuffers = resetBuffers.bind(this, simObj);
    simObj.tickBuffers = tickBuffers.bind(this, simObj);
    simObj.highlightShortestPaths = highlightShortestPaths.bind(this, renderer, simObj);
    simObj.setColor = setColor.bind(this, renderer, simObj);
    simObj.setMidEdges = setMidEdges.bind(this, simObj);
    simObj.tickInitialBufferVersions = tickInitialBufferVersions.bind(this, simObj);

    simObj.numPoints = 0;
    simObj.numEdges = 0;
    simObj.numForwardsWorkItems = 0;
    simObj.numBackwardsWorkItems = 0;
    simObj.numMidPoints = 0;
    simObj.numMidEdges = 0;
    simObj.numSplits = controls.global.numSplits;
    simObj.numRenderedSplits = controls.global.numRenderedSplits;
    simObj.pointLabels = [];
    simObj.edgeLabels = [];

    simObj.bufferHostCopies = {
        unsortedEdges: null,
        forwardsEdges: null,
        backwardsEdges: null
    };

    simObj.vgraph = null;

    simObj.buffers = {
        nextPoints: null,
        randValues: null,
        curPoints: null,
        degrees: null,
        forwardsEdges: null,
        forwardsDegrees: null,
        forwardsWorkItems: null,
        backwardsEdges: null,
        backwardsDegrees: null,
        backwardsWorkItems: null,
        springsPos: null,
        midSpringsPos: null,
        midSpringsColorCoord: null,
        midEdgeColors: null,
        nextMidPoints: null,
        curMidPoints: null,
        partialForces1: null,
        partialForces2: null,
        curForces: null,
        prevForces: null,
        swings: null,
        tractions: null,
        outputEdgeForcesMap: null,
        globalCarryOut: null,
        forwardsEdgeStartEndIdxs: null,
        backwardsEdgeStartEndIdxs: null,
        segStart: null,
        edgeWeights: null
    };

    dataframe.setNumElements('point', renderer.numPoints);
    dataframe.setNumElements('edge', renderer.numEdges);
    dataframe.setNumElements('splits', controls.global.numSplits);
    dataframe.setNumElements('renderedSplits', controls.global.numRenderedSplits || 0);

    simObj.tickInitialBufferVersions();

    Object.seal(simObj.buffers);
    Object.seal(simObj);

    logger.trace('Simulator created');

    return simObj;

}

export function create(dataframe, renderer, cl, device, vendor, cfg) {
    return Q().then(function () {
        // Pick the first layout algorithm that matches our device type
        var type, // GPU device type
            availableControls, // Available controls for device type
            controls,
            layoutAlgorithms,
            simObj;

        type = cl.deviceProps.TYPE.trim();

        availableControls = _.filter(cfg, function (algo) {
            return _.contains(algo.devices, type);
        });
        if (availableControls.length === 0) {
            logger.die('No layout controls satisfying device/vendor requirements', device, vendor);
        }
        controls = availableControls[0];
        layoutAlgorithms = controls.layoutAlgorithms;

        simObj = {
            renderer: renderer,
            cl: cl,
            elementsPerPoint: 2,
            versions: {
                tick: 0,
                buffers: { }
            },
            controls: controls,
            dataframe: dataframe
        };

        // Give dataframe pointer to simObj
        dataframe.simulator = simObj;


        return new Q().then(function () {
            logger.debug({layoutAlgorithms: layoutAlgorithms}, 'Instantiating layout algorithms');
            return _.map(layoutAlgorithms, function (la) {
                var algo = new la.algo(cl);
                algo.setPhysics(_.object(_.map(la.params, function (p, name) {
                    return [name, p.value];
                })));
                return algo;
            });
        }).then(function (algos) {
            logger.trace("Creating SimCL...");

            simObj.layoutAlgorithms = algos;
            simObj.otherKernels = {
                moveNodes: new MoveNodes(cl),
                selectNodesInRect: new SelectNodesInRect(cl),
                selectNodesInCircle: new SelectNodesInCircle(cl)
                //histogramKernel: new HistogramKernel(cl),
            };
            simObj.tilesPerIteration = 1;
            simObj.buffersLocal = {};

            simObj.tick = tick.bind(this, simObj);
            simObj.setPoints = setPoints.bind(this, simObj);
            simObj.setEdges = setEdges.bind(this, renderer, simObj);
            simObj.setSelectedPointIndexes = setSelectedPointIndexes.bind(this, simObj);
            simObj.setSelectedEdgeIndexes = setSelectedEdgeIndexes.bind(this, simObj);
            simObj.setMidEdgeColors = setMidEdgeColors.bind(this, simObj);
            simObj.setLocks = setLocks.bind(this, simObj);
            simObj.setPhysics = setPhysics.bind(this, simObj);
            simObj.moveNodes = moveNodes.bind(this, simObj);
            simObj.selectNodesInRect = selectNodesInRect.bind(this, simObj);
            simObj.selectNodesInCircle = selectNodesInCircle.bind(this, simObj);
            simObj.connectedEdges = connectedEdges.bind(this, simObj);
            simObj.resetBuffers = resetBuffers.bind(this, simObj);
            simObj.tickBuffers = tickBuffers.bind(this, simObj);
            simObj.highlightShortestPaths = highlightShortestPaths.bind(this, renderer, simObj);
            simObj.setColor = setColor.bind(this, renderer, simObj);
            simObj.setMidEdges = setMidEdges.bind(this, simObj);
            simObj.tickInitialBufferVersions = tickInitialBufferVersions.bind(this, simObj);

            simObj.numPoints = 0;
            simObj.numEdges = 0;
            simObj.numForwardsWorkItems = 0;
            simObj.numBackwardsWorkItems = 0;
            simObj.numMidPoints = 0;
            simObj.numMidEdges = 0;
            simObj.numSplits = controls.global.numSplits;
            simObj.numRenderedSplits = controls.global.numRenderedSplits;
            simObj.pointLabels = [];
            simObj.edgeLabels = [];

            simObj.bufferHostCopies = {
                unsortedEdges: null,
                forwardsEdges: null,
                backwardsEdges: null
            };

            simObj.vgraph = null;

            simObj.buffers = {
                nextPoints: null,
                randValues: null,
                curPoints: null,
                degrees: null,
                forwardsEdges: null,
                forwardsDegrees: null,
                forwardsWorkItems: null,
                backwardsEdges: null,
                backwardsDegrees: null,
                backwardsWorkItems: null,
                springsPos: null,
                midSpringsPos: null,
                midSpringsColorCoord: null,
                midEdgeColors: null,
                nextMidPoints: null,
                curMidPoints: null,
                partialForces1: null,
                partialForces2: null,
                curForces: null,
                prevForces: null,
                swings: null,
                tractions: null,
                outputEdgeForcesMap: null,
                globalCarryOut: null,
                forwardsEdgeStartEndIdxs: null,
                backwardsEdgeStartEndIdxs: null,
                segStart: null,
                edgeWeights: null
            };

            dataframe.setNumElements('point', renderer.numPoints);
            dataframe.setNumElements('edge', renderer.numEdges);
            dataframe.setNumElements('splits', controls.global.numSplits);
            dataframe.setNumElements('renderedSplits', controls.global.numRenderedSplits || 0);

            simObj.tickInitialBufferVersions();

            Object.seal(simObj.buffers);
            Object.seal(simObj);

            logger.trace('Simulator created');
            return simObj;
        });
    }).fail(log.makeQErrorHandler(logger, 'Cannot create SimCL'));
}

// TODO: Deprecate this in favor of encodings.
function setColor (renderer, simulator, colorObj) {

    //TODO why are these reversed?
    var rgb =
        (colorObj.rgb.r << 0)
        + (colorObj.rgb.g << 8)
        + (colorObj.rgb.b << 16);

    for (var v = 0; v < renderer.numPoints; v++) {
        simulator.dataframe.setLocalBufferValue('pointColors', v, rgb);
    }
    for (var e = 0; e < renderer.numEdges; e++) {
        simulator.dataframe.setLocalBufferValue('edgeColors', 2*e, rgb);
        simulator.dataframe.setLocalBufferValue('edgeColors', 2*e+1, rgb);
    }
    simulator.tickBuffers(['pointColors', 'edgeColors']);
    return Q();
}


//////////////////////////////////////////////////////////////////////////////
// Highlight shortest path code
// TODO: Bring it back in terms of encodings, toss somewhere besides simulator
//////////////////////////////////////////////////////////////////////////////

//Simulator * int * int -> int U exn
function findEdgeDirected (simulator, src, dst) {
    var buffers = simulator.dataframe.getHostBuffer('forwardsEdges');

    var workItem = buffers.srcToWorkItem[ src ];
    var firstEdge = buffers.workItemsTyped[4 * workItem];
    var numSiblings = buffers.workItemsTyped[4 * workItem + 1];

    if (firstEdge === -1) {
        throw new Error('not found');
    }

    for (var sibling = 0; sibling < numSiblings; sibling++) {
        var edge = firstEdge + sibling;
        var sink = buffers.edgesTyped[2 * edge + 1];
        if (sink === dst) {
            return edge;
        }
    }

    throw new Error('not found');
}

//Simulator * int * int -> int U exn
function findEdgeUndirected (simulator, src, dst) {
    try {
        return findEdgeDirected(simulator, src, dst);
    } catch (ignore) {
        return findEdgeDirected(simulator, dst, src);
    }
}

function highlightPath (renderer, simulator, path, i) {
    if (path.length < 2) {
        return;
    }

    var COLOR = -1 * util.palettes.qual_palette1[i % util.palettes.qual_palette1.length];

    var points = _.union(path);
    points.forEach(function (point) {
        if (point !== path[0] && point !== path[path.length -1]) {
            simulator.dataframe.setLocalBufferValue('pointColors', point, COLOR);
        }
    });

    var edges = _.zip(path.slice(0, -1), path.slice(1));
    edges.forEach(function (pair/*, i*/) {
        var edge = findEdgeUndirected(simulator, pair[0], pair[1]);
        simulator.dataframe.setLocalBufferValue('edgeColors', 2 * edge, COLOR);
        simulator.dataframe.setLocalBufferValue('edgeColors', 2 * edge + 1, COLOR);
    });
}

function highlightShortestPaths (renderer, simulator, pair) {
    var MAX_PATHS = util.palettes.qual_palette1.length * 2;

    var graph = new dijkstra.Graph();

    for (var v = 0; v < renderer.numPoints; v++) {
        graph.addVertex(v);
    }
    for (var e = 0; e < renderer.numEdges; e++) {
        var src = simulator.dataframe.getHostBuffer('forwardsEdges').edgesTyped[2 * e];
        var dst = simulator.dataframe.getHostBuffer('forwardsEdges').edgesTyped[2 * e + 1];

        graph.addEdge(src, dst, 1);
        graph.addEdge(dst, src, 1);
    }

    var paths = [];
    var t0 = Date.now();
    var ok = pair[0] !== pair[1];
    var i;
    while (ok && (Date.now() - t0 < 20 * 1000) && paths.length < MAX_PATHS) {

        var path = dijkstra.dijkstra(graph, pair[0]);

        if (path[pair[1]] === -1) {
            ok = false;
        } else {
            var steps = [];
            var step = pair[1];
            while (step !== pair[0]) {
                steps.push(step);
                step = path[step];
            }
            steps.push(pair[0]);
            steps.reverse();
            paths.push(steps);

            for (i = 0; i < steps.length - 1; i++) {
                graph.removeEdge(steps[i], steps[i + 1]);
            }

        }
    }

    paths.forEach(highlightPath.bind('', renderer, simulator));

    var biggestPoint = Math.max(
        simulator.dataframe.getLocalBuffer('pointSizes')[pair[0]],
        simulator.dataframe.getLocalBuffer('pointSizes')[pair[1]]);
    for (i = 0; i < Math.min(10000, renderer.numPoints); i++) {
        biggestPoint = Math.max(biggestPoint, simulator.dataframe.getLocalBuffer('pointSizes')[i]);
    }
    simulator.dataframe.setLocalBufferValue('pointSizes', pair[0], biggestPoint);
    simulator.dataframe.setLocalBufferValue('pointSizes', pair[1], biggestPoint);

    simulator.tickBuffers(['pointSizes', 'pointColors', 'edgeColors']);
}

/**
 * Simulator * ?[ String ] * ?int -> ()
 * Increase buffer version to tick number, signifying its contents may have changed
 * (Same version number signifies no change since last read of that buffer)
 * If not tick provided, increment global and use that
 **/

function tickBuffers (simulator, bufferNames, tick) {

    if (tick === undefined) {
        simulator.versions.tick++;
        tick = simulator.versions.tick;
    }

    if (bufferNames) {
        bufferNames.forEach(function (name) {
            simulator.versions.buffers[name] = tick;
        });
    } else {
        _.keys(simulator.versions.buffers).forEach(function (name) {
            simulator.versions.buffers[name] = tick;
            logger.trace('tick', name, tick);
        });
    }

}


/**
 * Given an array of (potentially null) buffers, delete the non-null buffers and set their
 * variable in the simulator buffer object to null.
 * NOTE: erase from host immediately, though device may take longer (unobservable)
 */
 // TODO: Rewrite this to be cleaner (e.g., take name list)
function resetBuffers (simulator, buffers) {

    if (!buffers.length) {
        return;
    }

    var simulatorBuffers = simulator.dataframe.getAllBuffers('simulator');

    var buffNames = buffers
        .filter(_.identity)
        .map(function (buffer) {
            for(var buff in simulatorBuffers) {
                if(simulatorBuffers.hasOwnProperty(buff) && simulatorBuffers[buff] == buffer) {
                    return buff;
                }
            }
            throw new Error("Could not find buffer", buffer);
        });

    tickBuffers(simulator, buffNames);

    //delete old
    buffNames.forEach(function(buffName) {
        simulator.dataframe.deleteBuffer(buffName);
    });
}


/**
 * Set the initial positions of the points in the NBody simulation (curPoints)
 * @param simulator - the simulator object created by SimCL.create()
 * @param {Float32Array} points - a typed array containing two elements for every point, the x
 * position, proceeded by the y position
 *
 * @returns a promise fulfilled by with the given simulator object
 */
function setPoints(simulator, points) {
    if(points.length < 1) {
        throw new Error("The points buffer is empty");
    }
    if(points.length % simulator.elementsPerPoint !== 0) {
        throw new Error("The points buffer is an invalid size (must be a multiple of " + simulator.elementsPerPoint + ")");
    }

    simulator.resetBuffers([
        simulator.dataframe.getBuffer('nextPoints', 'simulator'),
        simulator.dataframe.getBuffer('randValues', 'simulator'),
        simulator.dataframe.getBuffer('curPoints', 'simulator'),
        simulator.dataframe.getBuffer('partialForces1', 'simulator'),
        simulator.dataframe.getBuffer('partialForces2', 'simulator'),
        simulator.dataframe.getBuffer('curForces', 'simulator'),
        simulator.dataframe.getBuffer('prevForces', 'simulator'),
        simulator.dataframe.getBuffer('swings', 'simulator'),
        simulator.dataframe.getBuffer('tractions', 'simulator')
    ]);

    var numPoints = points.length / simulator.elementsPerPoint;
    simulator.dataframe.setNumElements('point', numPoints);

    //FIXME HACK:
    var guess = (numPoints * -0.00625 + 210).toFixed(0);
    logger.debug('Points:%d\tGuess:%d', numPoints, guess);

    simulator.tilesPerIteration = Math.min(Math.max(16, guess), 512);
    logger.debug('Using %d tiles per iterations', simulator.tilesPerIteration);

    simulator.renderer.numPoints = numPoints;

    logger.debug("Number of points in simulation: %d", numPoints);

    // Create buffers and write initial data to them, then set
    simulator.tickBuffers(['curPoints', 'randValues']);

    var swingsBytes = numPoints * Float32Array.BYTES_PER_ELEMENT;
    var randBufBytes = randLength * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT;

    return Q.all([
        simulator.renderer.createBuffer(points, 'curPoints'),
        simulator.cl.createBuffer(points.byteLength, 'nextPoints'),
        simulator.cl.createBuffer(points.byteLength, 'partialForces1'),
        simulator.cl.createBuffer(points.byteLength, 'partialForces2'),
        simulator.cl.createBuffer(points.byteLength, 'curForces'),
        simulator.cl.createBuffer(points.byteLength, 'prevForces'),
        simulator.cl.createBuffer(swingsBytes, 'swings'),
        simulator.cl.createBuffer(swingsBytes, 'tractions'),
        simulator.cl.createBuffer(randBufBytes, 'randValues')])
    .spread(function(pointsVBO, nextPointsBuf, partialForces1Buf, partialForces2Buf,
                     curForcesBuf, prevForcesBuf, swingsBuf, tractionsBuf, randBuf) {

        logger.trace('Created most of the points');

        simulator.dataframe.loadBuffer('nextPoints', 'simulator', nextPointsBuf);
        simulator.dataframe.loadBuffer('partialForces1', 'simulator', partialForces1Buf);
        simulator.dataframe.loadBuffer('partialForces2', 'simulator', partialForces2Buf);
        simulator.dataframe.loadBuffer('curForces', 'simulator', curForcesBuf);
        simulator.dataframe.loadBuffer('prevForces', 'simulator', prevForcesBuf);
        simulator.dataframe.loadBuffer('swings', 'simulator', swingsBuf);
        simulator.dataframe.loadBuffer('tractions', 'simulator', tractionsBuf);

        simulator.dataframe.loadRendererBuffer('curPoints', pointsVBO);

        // Generate an array of random values we will write to the randValues buffer
        simulator.dataframe.loadBuffer('randValues', 'simulator', randBuf);
        var rands = new Float32Array(randLength * simulator.elementsPerPoint);
        for(var i = 0; i < rands.length; i++) {
            rands[i] = Math.random();
        }

        var zeros = new Float32Array(numPoints * simulator.elementsPerPoint);
        for (var i = 0; i < zeros.length; i++) {
            zeros[i] = 0;
        }

        var swingZeros = new Float32Array(numPoints);
        var tractionOnes = new Float32Array(numPoints);
        for (var i = 0; i < swingZeros.length; i++) {
            swingZeros[i] = 0;
            tractionOnes[i] = 1;
        }

        swingsBuf.write(swingZeros);
        tractionsBuf.write(tractionOnes);
        return Q.all([
            simulator.cl.createBufferGL(pointsVBO, 'curPoints'),
            simulator.dataframe.writeBuffer('randValues', 'simulator', rands, simulator),
            simulator.dataframe.writeBuffer('prevForces', 'simulator', zeros, simulator),
            simulator.dataframe.writeBuffer('swings', 'simulator', swingZeros, simulator),
            simulator.dataframe.writeBuffer('tractions', 'simulator', tractionOnes, simulator)
        ]);
    })
    .spread(function(pointsBuf) {
        simulator.dataframe.loadBuffer('curPoints', 'simulator', pointsBuf);
    })
    .then(function () {
        _.each(simulator.layoutAlgorithms, function (la) {
            la.setPoints(simulator);
        });
        return simulator;
    }).fail(log.makeQErrorHandler(logger, 'Failure in SimCl.setPoints'));
}

function setMidEdges( simulator ) {
    logger.debug("In set midedges");
    simulator.controls.locks.interpolateMidPointsOnce = true;
    var bytesPerPoint,
        bytesPerEdge,
        numMidPoints,
        midPointsByteLength,
        springsByteLength;

    var numEdges = simulator.dataframe.getNumElements('edge');
    var numSplits = simulator.dataframe.getNumElements('splits');

    bytesPerPoint = simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT;
    bytesPerEdge = 2 * bytesPerPoint;
    numMidPoints = ( numEdges * (numSplits) );

    simulator.dataframe.setNumElements('midPoints', numMidPoints);
    var numRenderedSplits = simulator.dataframe.getNumElements('renderedSplits');

    var numMidEdges = ( numRenderedSplits + 1 ) * numEdges;
    simulator.dataframe.setNumElements('midEdges', numMidEdges);
    simulator.dataframe.setNumElements('numRenderedSplits', simulator.numRenderedSplits);
    midPointsByteLength = numMidPoints * bytesPerPoint;
    springsByteLength = numEdges * bytesPerEdge;

    simulator.dataframe.deleteBuffer('curMidPoints');
    simulator.dataframe.deleteBuffer('nextMidPoints');

    simulator.tickBuffers(['curMidPoints']);

    return Q.all( [
        simulator.cl.createBuffer( midPointsByteLength , 'nextMidPoints' ),
        simulator.renderer.createBuffer( midPointsByteLength , 'curMidPoints' ),
        simulator.renderer.createBuffer( simulator.numMidEdges * bytesPerEdge , 'midSprings' ),
        simulator.renderer.createBuffer( simulator.numMidEdges * bytesPerEdge , 'midSpringsColorCoord' ),
    ] )
    .spread( function ( nextMidPointsBuffer , curMidPointsVBO , midSpringsVBO , midSpringsColorCoordVBO ) {

        simulator.dataframe.loadBuffer('nextMidPoints', 'simulator', nextMidPointsBuffer);
        simulator.dataframe.loadRendererBuffer('curMidPoints', curMidPointsVBO);
        simulator.dataframe.loadRendererBuffer('midSprings', midSpringsVBO);
        simulator.dataframe.loadRendererBuffer('midSpringsColorCoord', midSpringsColorCoordVBO);

        return Q.all( [
            simulator.cl.createBufferGL( curMidPointsVBO , 'curMidPoints' ),
            simulator.cl.createBufferGL( midSpringsVBO , 'midSpringsPos' ),
            simulator.cl.createBufferGL( midSpringsColorCoordVBO , 'midSpringsColorCoord' ),
        ] )
    } )
    .spread( function ( midPointsBuf , midSpringsBuf , midSpringsColorCoordBuf ) {

        simulator.dataframe.loadBuffer('midSpringsPos', 'simulator', midSpringsBuf);
        simulator.dataframe.loadBuffer('curMidPoints', 'simulator', midPointsBuf);
        simulator.dataframe.loadBuffer('midSpringsColorCoord', 'simulator', midSpringsColorCoordBuf);

        return simulator;
    } )
    .then( function () {
        simulator.setMidEdgeColors(undefined);
    } )
    .then( function () {
        return Q.all(
            simulator.layoutAlgorithms
                .map(function (alg) {
                    return alg.setEdges(simulator);
                }));
    } )
    .fail( log.makeQErrorHandler(logger, 'Failure in SimCL.setMidEdges') )
}

/**
 * Sets the edge list for the graph
 *
 * @param simulator - the simulator object to set the edges for
 * @param {edgesTyped: {Uint32Array}, numWorkItems: uint, workItemsTyped: {Int32Array} } forwardsEdges -
 *        Edge list as represented in input graph.
 *        edgesTyped is buffer where every two items contain the index of the source
 *        node for an edge, and the index of the target node of the edge.
 *        workItems is a buffer where every two items encode information needed by
 *         one thread: the index of the first edge it should process, and the number of
 *         consecutive edges it should process in total.
 * @param {edgesTyped: {Uint32Array}, numWorkItems: uint, workItemsTypes: {Uint32Array} } backwardsEdges -
 *        Same as forwardsEdges, except reverse edge src/dst and redefine workItems/numWorkItems corresondingly.
 * @param {Float32Array} midPoints - dense array of control points (packed sequence of nDim structs)
 * @returns {Q.promise} a promise for the simulator object
 */
function setEdges(renderer, simulator, unsortedEdges, forwardsEdges, backwardsEdges, degrees, trash, endPoints, points) {
    //edges, workItems

    var nDim = simulator.controls.global.dimensions.length;
    var elementsPerEdge = 2; // The number of elements in the edges buffer per spring
    var elementsPerWorkItem = 4;
    var numSplits = simulator.dataframe.getNumElements('splits');
    var numEdges = forwardsEdges.edgesTyped.length / elementsPerEdge;
    var midPoints = new Float32Array((unsortedEdges.length / 2) * numSplits * nDim || 1);
    var numMidEdges = (numSplits + 1) * numEdges;
    var numPoints = simulator.dataframe.getNumElements('point');

    logger.debug("Number of midpoints: ", numSplits);

    if(forwardsEdges.edgesTyped.length < 1) {
        throw new Error("The edge buffer is empty");
    }
    if(forwardsEdges.edgesTyped.length % elementsPerEdge !== 0) {
        throw new Error("The edge buffer size is invalid (must be a multiple of " + elementsPerEdge + ")");
    }
    if(forwardsEdges.workItemsTyped.length < 1) {
        throw new Error("The work items buffer is empty");
    }
    if(forwardsEdges.workItemsTyped.length % elementsPerWorkItem !== 0) {
        throw new Error("The work item buffer size is invalid (must be a multiple of " + elementsPerWorkItem + ")");
    }

    simulator.dataframe.loadHostBuffer('unsortedEdges', unsortedEdges);
    simulator.dataframe.loadHostBuffer('forwardsEdges', forwardsEdges);
    simulator.dataframe.loadHostBuffer('backwardsEdges', backwardsEdges);

    var logicalEdges = forwardsEdges.edgesTyped;
    simulator.tickBuffers(['logicalEdges', 'forwardsEdgeStartEndIdxs', 'backwardsEdgeStartEndIdxs']);

    simulator.resetBuffers([

        simulator.dataframe.getBuffer('degrees', 'simulator'),
        simulator.dataframe.getBuffer('forwardsEdges', 'simulator'),
        simulator.dataframe.getBuffer('forwardsDegrees', 'simulator'),
        simulator.dataframe.getBuffer('forwardsWorkItems', 'simulator'),
        simulator.dataframe.getBuffer('backwardsEdges', 'simulator'),
        simulator.dataframe.getBuffer('backwardsDegrees', 'simulator'),
        simulator.dataframe.getBuffer('backwardsWorkItems', 'simulator'),
        simulator.dataframe.getBuffer('outputEdgeForcesMap', 'simulator'),
        simulator.dataframe.getBuffer('springsPos', 'simulator'),
        simulator.dataframe.getBuffer('midSpringsPos', 'simulator'),
        simulator.dataframe.getBuffer('forwardsEdgeStartEndIdxs', 'simulator'),
        simulator.dataframe.getBuffer('backwardsStartEndIdxs', 'simulator'),
        simulator.dataframe.getBuffer('midSpringsColorCoord', 'simulator')
    ]);

    return Q().then(function() {

        // Init constant
        simulator.dataframe.setNumElements('edge', numEdges);
        logger.debug("Number of edges in simulation: %d", numEdges);

        simulator.dataframe.setNumElements('forwardsWorkItems', forwardsEdges.workItemsTyped.length / elementsPerWorkItem);
        simulator.dataframe.setNumElements('backwardsWorkItems', backwardsEdges.workItemsTyped.length / elementsPerWorkItem);
        simulator.dataframe.setNumElements('midPoints', midPoints.length / simulator.elementsPerPoint);
        simulator.dataframe.setNumElements('midEdges', numMidEdges);

        // Create buffers
        return Q.all([
            simulator.cl.createBuffer(degrees.byteLength, 'degrees'),
            simulator.cl.createBuffer(forwardsEdges.edgesTyped.byteLength, 'forwardsEdges'),
            simulator.cl.createBuffer(forwardsEdges.degreesTyped.byteLength, 'forwardsDegrees'),
            simulator.cl.createBuffer(forwardsEdges.workItemsTyped.byteLength, 'forwardsWorkItems'),
            simulator.cl.createBuffer(backwardsEdges.edgesTyped.byteLength, 'backwardsEdges'),
            simulator.cl.createBuffer(backwardsEdges.degreesTyped.byteLength, 'backwardsDegrees'),
            simulator.cl.createBuffer(backwardsEdges.workItemsTyped.byteLength, 'backwardsWorkItems'),
            simulator.cl.createBuffer(midPoints.byteLength, 'nextMidPoints'),
            simulator.renderer.createBuffer(numEdges * elementsPerEdge * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 'springs'),
            simulator.renderer.createBuffer(midPoints, 'curMidPoints'),
            simulator.renderer.createBuffer(numMidEdges * elementsPerEdge * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 'midSprings'),
            simulator.renderer.createBuffer(numMidEdges * elementsPerEdge * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 'midSpringsColorCoord'),
            simulator.cl.createBuffer(forwardsEdges.edgesTyped.byteLength, 'outputEdgeForcesMap'),
            simulator.cl.createBuffer(1 + Math.ceil(numEdges / 256), 'globalCarryIn'),
            simulator.cl.createBuffer(forwardsEdges.edgeStartEndIdxsTyped.byteLength, 'forwardsEdgeStartEndIdxs'),
            simulator.cl.createBuffer(backwardsEdges.edgeStartEndIdxsTyped.byteLength, 'backwardsEdgeStartEndIdxs'),
            simulator.cl.createBuffer((numPoints * Float32Array.BYTES_PER_ELEMENT) / 2, 'segStart')])
    })
    .spread(function(degreesBuffer,
                     forwardsEdgesBuffer, forwardsDegreesBuffer, forwardsWorkItemsBuffer,
                     backwardsEdgesBuffer, backwardsDegreesBuffer, backwardsWorkItemsBuffer,
                     nextMidPointsBuffer, springsVBO,
                     midPointsVBO, midSpringsVBO, midSpringsColorCoordVBO,
                     outputEdgeForcesMap, globalCarryOut, forwardsEdgeStartEndIdxs, backwardsEdgeStartEndIdxs,
                     segStart) {
        // Bind buffers
        simulator.dataframe.loadBuffer('degrees', 'simulator', degreesBuffer);
        simulator.dataframe.loadBuffer('forwardsEdges', 'simulator', forwardsEdgesBuffer);
        simulator.dataframe.loadBuffer('forwardsDegrees', 'simulator', forwardsDegreesBuffer);
        simulator.dataframe.loadBuffer('forwardsWorkItems', 'simulator', forwardsWorkItemsBuffer);
        simulator.dataframe.loadBuffer('backwardsEdges', 'simulator', backwardsEdgesBuffer);
        simulator.dataframe.loadBuffer('backwardsDegrees', 'simulator', backwardsDegreesBuffer);
        simulator.dataframe.loadBuffer('backwardsWorkItems', 'simulator', backwardsWorkItemsBuffer);
        simulator.dataframe.loadBuffer('nextMidPoints', 'simulator', nextMidPointsBuffer);
        simulator.dataframe.loadBuffer('outputEdgeForcesMap', 'simulator', outputEdgeForcesMap);
        simulator.dataframe.loadBuffer('globalCarryOut', 'simulator', globalCarryOut);
        simulator.dataframe.loadBuffer('forwardsEdgeStartEndIdxs', 'simulator', forwardsEdgeStartEndIdxs);
        simulator.dataframe.loadBuffer('backwardsEdgeStartEndIdxs', 'simulator', backwardsEdgeStartEndIdxs);
        simulator.dataframe.loadBuffer('segStart', 'simulator', segStart);

        simulator.dataframe.loadRendererBuffer('springs', springsVBO);
        simulator.dataframe.loadRendererBuffer('curMidPoints', midPointsVBO);
        simulator.dataframe.loadRendererBuffer('midSprings', midSpringsVBO);
        simulator.dataframe.loadRendererBuffer('midSpringsColorCoord', midSpringsColorCoordVBO);

        return Q.all([
            simulator.cl.createBufferGL(springsVBO, 'springsPos'),
            simulator.cl.createBufferGL(midPointsVBO, 'curMidPoints'),
            simulator.cl.createBufferGL(midSpringsVBO, 'midSpringsPos'),
            simulator.cl.createBufferGL(midSpringsColorCoordVBO, 'midSpringsColorCoord'),
            simulator.dataframe.writeBuffer('degrees', 'simulator', degrees, simulator),
            simulator.dataframe.writeBuffer('forwardsEdges', 'simulator', forwardsEdges.edgesTyped, simulator),
            simulator.dataframe.writeBuffer('forwardsDegrees', 'simulator', forwardsEdges.degreesTyped, simulator),
            simulator.dataframe.writeBuffer('forwardsWorkItems', 'simulator', forwardsEdges.workItemsTyped, simulator),
            simulator.dataframe.writeBuffer('backwardsEdges', 'simulator', backwardsEdges.edgesTyped, simulator),
            simulator.dataframe.writeBuffer('backwardsDegrees', 'simulator', backwardsEdges.degreesTyped, simulator),
            simulator.dataframe.writeBuffer('backwardsWorkItems', 'simulator', backwardsEdges.workItemsTyped, simulator),
            simulator.dataframe.writeBuffer('forwardsEdgeStartEndIdxs', 'simulator', forwardsEdges.edgeStartEndIdxsTyped, simulator),
            simulator.dataframe.writeBuffer('backwardsEdgeStartEndIdxs', 'simulator', backwardsEdges.edgeStartEndIdxsTyped, simulator)
        ]);
    })
    .spread(function(springsBuffer, midPointsBuf, midSpringsBuffer, midSpringsColorCoordBuffer) {

        simulator.dataframe.loadBuffer('springsPos', 'simulator', springsBuffer);
        simulator.dataframe.loadBuffer('midSpringsPos', 'simulator', midSpringsBuffer);
        simulator.dataframe.loadBuffer('curMidPoints', 'simulator', midPointsBuf);
        simulator.dataframe.loadBuffer('midSpringsColorCoord', 'simulator', midSpringsColorCoordBuffer);
    })
    .then(function () {
        return Q.all([
            simulator.dataframe.writeBuffer('springsPos', 'simulator', endPoints, simulator)
        ]);
    })
    .then( function () {
        return Q.all(
            simulator.layoutAlgorithms
                .map(function (alg) {
                    return alg.setEdges(simulator);
                }));
    })
    .then(function () {
        return simulator;
    })
    .fail(log.makeQErrorHandler(logger, 'Failure in SimCL.setEdges'));
}


function setSelectedEdgeIndexes(simulator, selectedEdgeIndexes) {
    // TODO call in same promise chain as other set calls.
    simulator.dataframe.loadLocalBuffer('selectedEdgeIndexes', selectedEdgeIndexes);
    simulator.tickBuffers(['selectedEdgeIndexes']);
}


function setSelectedPointIndexes(simulator, selectedPointIndexes) {
    // TODO call in same promise chain as other set calls.
    simulator.dataframe.loadLocalBuffer('selectedPointIndexes', selectedPointIndexes);
    simulator.tickBuffers(['selectedPointIndexes']);
}

// TODO Write kernel for this.
function setMidEdgeColors(simulator, midEdgeColors) {
    var /*midEdgeColors, */forwardsEdges, srcNodeIdx, dstNodeIdx, srcColorInt, srcColor,
        dstColorInt, dstColor, edgeIndex, midEdgeIndex, numSegments, lambda,
        colorHSVInterpolator, convertRGBInt2Color, convertColor2RGBInt, interpolatedColorInt;

    var numEdges = simulator.dataframe.getNumElements('edge');
    var numRenderedSplits = simulator.dataframe.getNumElements('renderedSplits');
    var numMidEdgeColors = numEdges * (numRenderedSplits + 1);

    var interpolatedColor = {};
    srcColor = {};
    dstColor = {};

    if (!midEdgeColors) {
        logger.trace('Using default midedge colors');
        midEdgeColors = new Uint32Array(4 * numMidEdgeColors);
        numSegments = numRenderedSplits + 1;
        forwardsEdges = simulator.dataframe.getHostBuffer('forwardsEdges');
        // forwardsEdges = simulator.bufferHostCopies.forwardsEdges;

        // Interpolate colors in the HSV color space.
        colorHSVInterpolator = function (color1, color2, lambda) {
            var color1HSV, color2HSV, h, s, v;
            color1HSV = color1.hsv();
            color2HSV = color2.hsv();
            var h1 = color1HSV.h;
            var h2 = color2HSV.h;
            var maxCCW = h1 - h2;
            var maxCW =  (h2 + 360) - h1;
            var hueStep;
            if (maxCW > maxCCW) {
                //hueStep = higherHue - lowerHue;
                //hueStep = h2 - h1;
                hueStep = h2 - h1;
            } else {
                //hueStep = higherHue - lowerHue;
                hueStep = (360 + h2) - h1;
            }
            h = (h1 + (hueStep * (lambda))) % 360;
            //h = color1HSV.h * (1 - lambda) + color2HSV.h * (lambda);
            s = color1HSV.s * (1 - lambda) + color2HSV.s * (lambda);
            v = color1HSV.v * (1 - lambda) + color2HSV.v * (lambda);
            return interpolatedColor.hsv([h, s, v]);
        };

        var colorRGBInterpolator = function (color1, color2, lambda) {
            var r, g, b;
            r = color1.r * (1 - lambda) + color2.r * (lambda);
            g = color1.g * (1 - lambda) + color2.g * (lambda);
            b = color1.b * (1 - lambda) + color2.b * (lambda);
            return {
                r: r,
                g: g,
                b: b
            };
        };

        // Convert from HSV to RGB Int
        convertColor2RGBInt = function (color) {
            return (color.r << 0) + (color.g << 8) + (color.b << 16);
        };

        // Convert from RGB Int to HSV
        convertRGBInt2Color= function (rgbInt) {
            return {
                r:rgbInt & 0xFF,
                g:(rgbInt >> 8) & 0xFF,
                b:(rgbInt >> 16) & 0xFF
            };
        };

        var pointColorsBuffer = simulator.dataframe.getLocalBuffer('pointColors');

        for (edgeIndex = 0; edgeIndex < numEdges; edgeIndex++) {
            srcNodeIdx = forwardsEdges.edgesTyped[2 * edgeIndex];
            dstNodeIdx = forwardsEdges.edgesTyped[2 * edgeIndex + 1];

            srcColorInt = pointColorsBuffer[srcNodeIdx];
            dstColorInt = pointColorsBuffer[dstNodeIdx];

            srcColor = convertRGBInt2Color(srcColorInt);
            dstColor = convertRGBInt2Color(dstColorInt);

            interpolatedColorInt = convertColor2RGBInt(srcColor);

            for (midEdgeIndex = 0; midEdgeIndex < numSegments; midEdgeIndex++) {
                midEdgeColors[(2 * edgeIndex) * numSegments + (2 * midEdgeIndex)] =
                    interpolatedColorInt;
                lambda = (midEdgeIndex + 1) / (numSegments);
                interpolatedColorInt =
                    convertColor2RGBInt(colorRGBInterpolator(srcColor, dstColor, lambda));
                midEdgeColors[(2 * edgeIndex) * numSegments + (2 * midEdgeIndex) + 1] =
                    interpolatedColorInt;
            }
        }
    }
    simulator.dataframe.loadLocalBuffer('midEdgeColors', midEdgeColors);
    simulator.tickBuffers(['midEdgeColors']);
    return Q(simulator);
}

function setLocks(simulator, cfg) {
    _.extend(simulator.controls.locks, cfg || {});
    return Q();
}



function setPhysics(simulator, cfg) {
    logger.debug('SimCL set physics', cfg)
    _.each(simulator.layoutAlgorithms, function (algo) {
        if (algo.name in cfg) {
            algo.setPhysics(cfg[algo.name]);
        }
    });
    return Q();
}


function moveNodes(simulator, marqueeEvent) {
    logger.debug('marqueeEvent', marqueeEvent);

    var drag = marqueeEvent.drag;
    var delta = {
        x: drag.end.x - drag.start.x,
        y: drag.end.y - drag.start.y
    };

    var moveNodesKernel = simulator.otherKernels.moveNodes;

    return moveNodesKernel.run(simulator, marqueeEvent.selection, delta)
        .fail(log.makeQErrorHandler(logger, 'Failure trying to move nodes'));
}

function selectionKernelResultToMask(arrayOfBits) {
    var selectedIndexes = [];
    for(var i = 0; i < arrayOfBits.length; i++) {
        if (arrayOfBits[i] === 1) {
            selectedIndexes.push(i);
        }
    }
    return new Uint32Array(selectedIndexes);
}

function selectNodesInRect(simulator, selection) {
    logger.debug('selectNodesInRect', selection);

    var selectNodesInRectKernel = simulator.otherKernels.selectNodesInRect;

    if (selection.all) {
        return Q(_.range(simulator.dataframe.getNumElements('point')));
    }

    return selectNodesInRectKernel.run(simulator, selection)
        .then(function (arrayOfBits) {
            return selectionKernelResultToMask(arrayOfBits);
        }).fail(log.makeQErrorHandler(logger, 'Failure trying to compute selection'));
}

function selectNodesInCircle(simulator, selection) {
    logger.debug('selectNodesInCircle', selection);

    var selectNodesInCircleKernel = simulator.otherKernels.selectNodesInCircle;

    if (selection.all) {
        return Q(_.range(simulator.dataframe.getNumElements('point')));
    }

    return selectNodesInCircleKernel.run(simulator, selection)
        .then(function (arrayOfBits) {
            return selectionKernelResultToMask(arrayOfBits);
        }).fail(log.makeQErrorHandler(logger, 'Failure trying to compute selection'));
}

// Return the set of edge indices which are connected (either as src or dst)
// to nodes in nodeIndices
// Returns SORTED EDGE INDICES
// TODO: Move into dataframe, since it has the crazy sorted/unsorted knowledge?
function connectedEdges(simulator, nodeIndices) {

    var forwardsBuffers = simulator.dataframe.getHostBuffer('forwardsEdges');
    var backwardsBuffers = simulator.dataframe.getHostBuffer('backwardsEdges');
    var forwardsPermutation = forwardsBuffers.edgePermutation;

    var setOfEdges = [];
    var edgeHash = {};

    var addOutgoingEdgesToSet = function (buffers, nodeIndices) {
        _.each(nodeIndices, function (idx) {
            var workItemId = buffers.srcToWorkItem[idx];
            var firstEdgeId = buffers.workItemsTyped[4*workItemId];
            var numEdges = buffers.workItemsTyped[4*workItemId + 1];
            var permutation = buffers.edgePermutationInverseTyped;

            for (var i = 0; i < numEdges; i++) {
                var edge = forwardsPermutation[permutation[firstEdgeId + i]];
                if (!edgeHash[edge]) {
                    setOfEdges.push(edge);
                    edgeHash[edge] = true;
                }
            }
        });
    };

    addOutgoingEdgesToSet(forwardsBuffers, nodeIndices);
    addOutgoingEdgesToSet(backwardsBuffers, nodeIndices);

    return new Uint32Array(setOfEdges);
}

// TODO: Deprecate this fully once we don't have any versioned buffers
// attached directly to the simulator.
function tickInitialBufferVersions(simulator) {
    simulator.tickBuffers([
        //points/edges
        'curPoints', 'nextPoints', 'springsPos',
        //style
        'edgeColors',
        //midpoints/midedges
        'curMidPoints', 'nextMidPoints', 'curMidPoints', 'midSpringsPos', 'midSpringsColorCoord'
    ]);
}


//simulator * int * {play: bool, layout: bool} -> ()
//input positions: curPoints
//output positions: nextPoints
function tick(simulator, stepNumber, cfg) {

    // If there are no points in the graph, don't run the simulation
    var numPoints = simulator.dataframe.getNumElements('point');
    if(numPoints < 1) {
        return Q(simulator);
    }

    simulator.versions.tick++;

    if (!cfg.layout) {
        logger.trace('No layout algs to run, early exit');
        return Q(simulator);
    }


    //run each algorithm to completion before calling next
    var tickAllHelper = function (remainingAlgorithms) {
        if (!remainingAlgorithms.length) { return Q(undefined); }
        var algorithm = remainingAlgorithms.shift();
        return Q()
            .then(function () {
                return algorithm.tick(simulator, stepNumber);
            })
            .then(function () {
                return tickAllHelper(remainingAlgorithms);
            });
    };

    return Q().then(function () {
        return tickAllHelper(simulator.layoutAlgorithms.slice(0));
    }).then(function() {
        if (stepNumber % 20 === 0 && stepNumber !== 0) {
            //TODO: move to perflogging
            logger.trace('Layout Perf Report (step: %d)', stepNumber);

            var totals = {};
            var runs = {};
            // Compute sum of means so we can print percentage of runtime
            _.each(simulator.layoutAlgorithms, function (la) {
               totals[la.name] = 0;
               runs[la.name] = 0;
            });
            _.each(simulator.layoutAlgorithms, function (la) {
                var total = totals[la.name] / stepNumber;
                logger.trace(sprintf('  %s (Total:%f) [ms]', la.name, total.toFixed(0)));
           });
        }
        // This cl.queue.finish() needs to be here because, without it, the queue appears to outside
        // code as running really fast, and tons of ticks will be called, flooding the GPU/CPU with
        // more stuff than they can handle.
        // What we really want here is to give finish() a callback and resolve the promise when it's
        // called, but node-webcl is out-of-date and doesn't support WebCL 1.0's optional callback
        // argument to finish().

        simulator.cl.finish(simulator.cl.queue);
        logger.trace('Tick Finished.');
        simulator.renderer.finish();
    }).fail(log.makeQErrorHandler(logger, 'SimCl tick failed'));
}

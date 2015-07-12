'use strict';

var _ = require('underscore');
var Q = require('q');
var debug = require('debug')('graphistry:graph-viz:graph:simcl');
var perf  = require('debug')('perf');
var sprintf = require('sprintf-js').sprintf;
var dijkstra = require('dijkstra');
var util = require('./util.js');
var log = require('common/log.js');
var eh = require('common/errorHandlers.js')(log);
var cljs = require('./cl.js');
var MoveNodes = require('./moveNodes.js');
var SelectNodes = require('./selectNodes.js');
var SpringsGather = require('./springsGather.js');
var webcl = require('node-webcl');
var Color = require('color');

// Do NOT enable this in prod. It destroys performance.
// Seriously.
// Q.longStackSupport = true;
var randLength = 73;


var NAMED_CLGL_BUFFERS = require('./buffers.js').NAMED_CLGL_BUFFERS;

function create(dataframe, renderer, device, vendor, cfg) {
    return cljs.create(renderer, device, vendor).then(function (cl) {
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
            log.die('No layout controls satisfying device/vendor requirements', device, vendor);
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

        return new Q().then(function () {
            debug('Instantiating layout algorithms: %o', layoutAlgorithms);
            return _.map(layoutAlgorithms, function (la) {
                var algo = new la.algo(cl);
                algo.setPhysics(_.object(_.map(la.params, function (p, name) {
                    return [name, p.value];
                })));
                return algo;
            });
        }).then(function (algos) {
            debug("Creating SimCL...");

            simObj.layoutAlgorithms = algos;
            simObj.otherKernels = {
                moveNodes: new MoveNodes(cl),
                selectNodes: new SelectNodes(cl),
                springsGather: new SpringsGather(cl)
            };
            simObj.tilesPerIteration = 1;
            simObj.buffersLocal = {};
            createSetters(simObj);

            simObj.tick = tick.bind(this, simObj);
            simObj.setPoints = setPoints.bind(this, simObj);
            simObj.setEdges = setEdges.bind(this, renderer, simObj);
            simObj.setEdgeColors = setEdgeColors.bind(this, simObj);
            simObj.setEdgeWeight = setEdgeWeight.bind(this, simObj);
            simObj.setMidEdgeColors = setMidEdgeColors.bind(this, simObj);
            simObj.setPointLabels = setPointLabels.bind(this, simObj);
            simObj.setEdgeLabels = setEdgeLabels.bind(this, simObj);
            simObj.setLocks = setLocks.bind(this, simObj);
            simObj.setPhysics = setPhysics.bind(this, simObj);
            simObj.setTimeSubset = setTimeSubset.bind(this, renderer, simObj);
            simObj.recolor = recolor.bind(this, simObj);
            simObj.moveNodes = moveNodes.bind(this, simObj);
            simObj.selectNodes = selectNodes.bind(this, simObj);
            simObj.connectedEdges = connectedEdges.bind(this, simObj);
            simObj.resetBuffers = resetBuffers.bind(this, simObj);
            simObj.tickBuffers = tickBuffers.bind(this, simObj);
            simObj.highlightShortestPaths = highlightShortestPaths.bind(this, renderer, simObj);
            simObj.setColor = setColor.bind(this, renderer, simObj);
            simObj.setMidEdges = setMidEdges.bind(this, simObj);

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
            _.extend(
                simObj.buffers,
                _.object(_.keys(NAMED_CLGL_BUFFERS).map(function (name) { return [name, null]; })),
                _.object(_.keys(NAMED_CLGL_BUFFERS)
                    .filter(function (name) { return NAMED_CLGL_BUFFERS[name].dims === 'numEdges'; })
                    .map(function (name) { return [name + '_reverse', null]; })));

            simObj.timeSubset = {
                relRange: {min: 0, max: 100},
                pointsRange:    {startIdx: 0, len: renderer.numPoints},
                edgeRange:      {startIdx: 0, len: renderer.numEdges},
                midPointsRange: {
                    startIdx: 0,
                    len: renderer.numPoints * controls.global.numSplits
                },
                midEdgeRange:   {
                    startIdx: 0,
                    len: renderer.numEdges * controls.global.numSplits
                }
            };

            dataframe.setNumElements('point', renderer.numPoints);
            dataframe.setNumElements('edge', renderer.numEdges);
            dataframe.setNumElements('splits', controls.global.numSplits);
            dataframe.setNumElements('renderedSplits', controls.global.numRenderedSplits || 0);

            Object.seal(simObj.buffers);
            Object.seal(simObj);

            debug('Simulator created');
            return simObj
        })
    }).fail(eh.makeErrorHandler('Cannot create SimCL'));
}


var setColor = function (renderer, simulator, colorObj) {

    //TODO why are these reversed?
    var rgb =
        (colorObj.rgb.r << 0)
        + (colorObj.rgb.g << 8)
        + (colorObj.rgb.b << 16);

    for (var v = 0; v < renderer.numPoints; v++) {
        simulator.dataframe.setLocalBufferValue('pointColors', v, rgb);
        // simulator.buffersLocal.pointColors[v] = rgb;
    }
    for (var e = 0; e < renderer.numEdges; e++) {
        simulator.dataframe.setLocalBufferValue('edgeColors', 2*e, rgb);
        simulator.dataframe.setLocalBufferValue('edgeColors', 2*e+1, rgb);
        // simulator.buffersLocal.edgeColors[2*e] = rgb;
        // simulator.buffersLocal.edgeColors[2*e+1] = rgb;
    }
    simulator.tickBuffers(['pointColors', 'edgeColors']);
};


//Simulator * int * int -> int U exn
var findEdgeDirected = function (simulator, src, dst) {
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
};

//Simulator * int * int -> int U exn
var findEdgeUndirected = function (simulator, src, dst) {
    try {
        return findEdgeDirected(simulator, src, dst);
    } catch (e) {
        return findEdgeDirected(simulator, dst, src);
    }
}

var highlightPath = function (renderer, simulator, path, i) {
    if (path.length < 2) {
        return;
    }

    var COLOR = -1 * util.palettes.qual_palette1[i % util.palettes.qual_palette1.length];

    var points = _.union(path);
    points.forEach(function (point) {
        if (point !== path[0] && point !== path[path.length -1]) {
            simulator.dataframe.setLocalBufferValue('pointColors', point, COLOR);
            // simulator.buffersLocal.pointColors[point] = COLOR;
        }
    });

    var edges = _.zip(path.slice(0, -1), path.slice(1));
    edges.forEach(function (pair, i) {
        var edge = findEdgeUndirected(simulator, pair[0], pair[1]);
        simulator.dataframe.setLocalBufferValue('edgeColors', 2 * edge, COLOR);
        simulator.dataframe.setLocalBufferValue('edgeColors', 2 * edge + 1, COLOR);
        // simulator.buffersLocal.edgeColors[2 * edge] = COLOR;
        // simulator.buffersLocal.edgeColors[2 * edge + 1] = COLOR;
    });
}

var highlightShortestPaths = function (renderer, simulator, pair) {
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
    var ok = pair[0] != pair[1];
    while (ok && (Date.now() - t0 < 20 * 1000) && paths.length < MAX_PATHS) {

        var path = dijkstra.dijkstra(graph, pair[0]);

        if (path[pair[1]] != -1) {
            var steps = [];
            var step = pair[1];
            while (step != pair[0]) {
                steps.push(step);
                step = path[step];
            }
            steps.push(pair[0]);
            steps.reverse();
            paths.push(steps);

            for (var i = 0; i < steps.length - 1; i++) {
                graph.removeEdge(steps[i], steps[i+1]);
            }

        } else {
            ok = false;
        }
    }

    paths.forEach(highlightPath.bind('', renderer, simulator));

    var biggestPoint = Math.max(
        simulator.dataframe.getLocalBuffer('pointSizes')[pair[0]],
        simulator.dataframe.getLocalBuffer('pointSizes')[pair[1]]);
    for (var i = 0; i < Math.min(10000, renderer.numPoints); i++) {
        biggestPoint = Math.max(biggestPoint, simulator.dataframe.getLocalBuffer(pointSizes)[i]);
    }
    simulator.dataframe.setLocalBufferValue('pointSizes', pair[0], biggestPoint);
    simulator.dataframe.setLocalBufferValue('pointSizes', pair[1], biggestPoint);

    // simulator.buffersLocal.pointSizes[pair[0]] = biggestPoint;
    // simulator.buffersLocal.pointSizes[pair[1]] = biggestPoint;

    simulator.tickBuffers(['pointSizes', 'pointColors', 'edgeColors']);
};

/**
 * Simulator * ?[ String ] * ?int -> ()
 * Increase buffer version to tick number, signifying its contents may have changed
 * (Same version number signifies no change since last read of that buffer)
 * If not tick provided, increment global and use that
 **/

var tickBuffers = function (simulator, bufferNames, tick) {

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
            console.log('tick', name, tick);
        });
    }

};


/**
 * Given an array of (potentially null) buffers, delete the non-null buffers and set their
 * variable in the simulator buffer object to null.
 * NOTE: erase from host immediately, though device may take longer (unobservable)
 */
 // TODO: Rewrite this to be cleaner (e.g., take name list)
var resetBuffers = function(simulator, buffers) {

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
        // simulator.buffers[buffName].delete();
        // simulator.buffers[buffName] = null;
    });
};


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

    // simulator.numPoints = points.length / simulator.elementsPerPoint;
    var numPoints = points.length / simulator.elementsPerPoint;
    simulator.dataframe.setNumElements('point', numPoints);

    //FIXME HACK:
    var guess = (numPoints * -0.00625 + 210).toFixed(0);
    debug('Points:%d\tGuess:%d', numPoints, guess);
    simulator.tilesPerIteration = Math.min(Math.max(16, guess), 512);
    debug('Using %d tiles per iterations', simulator.tilesPerIteration);

    simulator.renderer.numPoints = numPoints;

    debug("Number of points in simulation: %d", numPoints);

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

        debug('Created most of the points');
        // simulator.buffers.nextPoints = nextPointsBuf;
        // simulator.buffers.partialForces1 = partialForces1Buf;
        // simulator.buffers.partialForces2 = partialForces2Buf;
        // simulator.buffers.curForces = curForcesBuf;
        // simulator.buffers.prevForces = prevForcesBuf;
        // simulator.buffers.swings = swingsBuf;
        // simulator.buffers.tractions = tractionsBuf;

        simulator.dataframe.loadBuffer('nextPoints', 'simulator', nextPointsBuf);
        simulator.dataframe.loadBuffer('partialForces1', 'simulator', partialForces1Buf);
        simulator.dataframe.loadBuffer('partialForces2', 'simulator', partialForces2Buf);
        simulator.dataframe.loadBuffer('curForces', 'simulator', curForcesBuf);
        simulator.dataframe.loadBuffer('prevForces', 'simulator', prevForcesBuf);
        simulator.dataframe.loadBuffer('swings', 'simulator', swingsBuf);
        simulator.dataframe.loadBuffer('tractions', 'simulator', tractionsBuf);

        simulator.dataframe.loadRendererBuffer('curPoints', pointsVBO);
        // simulator.renderer.buffers.curPoints = pointsVBO;

        // Generate an array of random values we will write to the randValues buffer
        // simulator.buffers.randValues = randBuf;
        simulator.dataframe.loadBuffer('randValues', 'simulator', randBuf);
        var rands = new Float32Array(randLength * simulator.elementsPerPoint);
        for(var i = 0; i < rands.length; i++) {
            rands[i] = Math.random();
        }

        var zeros = new Float32Array(numPoints * simulator.elementsPerPoint);
        for (var i = 0; i < zeros.length; i++) {
            zeros[i] = 0;
        }

        return Q.all([
            simulator.cl.createBufferGL(pointsVBO, 'curPoints'),
            simulator.dataframe.writeBuffer('randValues', 'simulator', rands, simulator),
            simulator.dataframe.writeBuffer('prevForces', 'simulator', zeros, simulator)]);
    })
    .spread(function(pointsBuf) {
        simulator.dataframe.loadBuffer('curPoints', 'simulator', pointsBuf);
        // simulator.buffers.curPoints = pointsBuf;
    })
    .then(function () {
        _.each(simulator.layoutAlgorithms, function (la) {
            la.setPoints(simulator);
        });
        return simulator;
    }).fail(eh.makeErrorHandler('Failure in SimCl.setPoints'));
}


//string -> simulator * typedarray -> Q simulator
// Create and store buffer on host and device with passed in defaults
// returns corresponding setter
function makeSetter(simulator, name, dimName) {

    return function (data, isReverse) {

        var buffName = name + (dimName === 'edge' && !!isReverse ? '_reverse' : '');

        // simulator.buffersLocal[buffName] = data;
        simulator.dataframe.loadLocalBuffer(buffName, data);

        simulator.resetBuffers([simulator.dataframe.getBuffer(buffName, 'simulator')]);
        simulator.tickBuffers([buffName]);

        return simulator.renderer.createBuffer(data, buffName)
        .then(function(vbo) {
            debug('Created %s VBO', buffName);
            simulator.dataframe.loadRendererBuffer(buffName, vbo);
            // simulator.renderer.buffers[buffName] = vbo;
            return simulator.cl.createBufferGL(vbo, buffName);
        }).then(function (buffer) {
            // simulator.buffers[buffName] = buffer;
            simulator.dataframe.loadBuffer(buffName, 'simulator', buffer);
            return simulator;
        }).fail(eh.makeErrorHandler('ERROR Failure in SimCl.set %s', buffName));
    };
}



// ex:  simulator.setSizes(pointSizes).then(...)
function createSetters (simulator) {
    _.each(NAMED_CLGL_BUFFERS, function (cfg, bufferName) {
        simulator[cfg.setterName] = makeSetter(simulator, bufferName, cfg.dims);
    });
}

//Simulator * ?[HtmlString] -> ()
function setPointLabels(simulator, labels) {
    this.dataframe.loadLabels('point', (labels || []));
    // simulator.pointLabels = labels || [];
}

//Simulator * ?[HtmlString] -> ()
function setEdgeLabels(simulator, labels) {
    this.dataframe.loadLabels('edge', (labels || []));
    // simulator.edgeLabels = labels || [];
}

function setMidEdges( simulator ) {
    debug("In set midedges");
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

    // simulator.numMidPoints = numMidPoints;
    simulator.dataframe.setNumElements('midPoints', numMidPoints);
    var numRenderedSplits = simulator.dataframe.getNumElements('renderedSplits');

    var numMidEdges = ( numRenderedSplits + 1 ) * numEdges;
    // simulator.numMidEdges = ( numRenderedSplits + 1 ) * simulator.numEdges;
    simulator.dataframe.setNumElements('midEdges', numMidEdges);
    simulator.dataframe.setNumElements('numRenderedSplits', simulator.numRenderedSplits);
    // simulator.renderer.numRenderedSplits = simulator.numRenderedSplits;
    midPointsByteLength = numMidPoints * bytesPerPoint;
    springsByteLength = numEdges * bytesPerEdge;

    simulator.dataframe.deleteBuffer('curMidPoints');
    simulator.dataframe.deleteBuffer('nextMidPoints');

    // simulator.buffers.curMidPoints.delete();
    // simulator.buffers.nextMidPoints.delete();
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

        // simulator.buffers.nextMidPoints = nextMidPointsBuffer;
        // simulator.renderer.buffers.curMidPoints = curMidPointsVBO;
        // simulator.renderer.buffers.midSprings = midSpringsVBO;
        // simulator.renderer.buffers.midSpringsColorCoord = midSpringsColorCoordVBO;
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

        // simulator.buffers.midSpringsPos = midSpringsBuf;
        // simulator.buffers.curMidPoints = midPointsBuf;
        // simulator.buffers.midSpringsColorCoord = midSpringsColorCoordBuf;
        setTimeSubset( simulator.renderer , simulator , simulator.timeSubset.relRange );
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
    .fail( eh.makeErrorHandler('Failure in SimCL.setMidEdges') )
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

    debug("Number of midpoints: ", numSplits);

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

    // simulator.bufferHostCopies.unsortedEdges = unsortedEdges;
    // simulator.bufferHostCopies.forwardsEdges = forwardsEdges;
    // simulator.bufferHostCopies.backwardsEdges = backwardsEdges;

    var logicalEdges = forwardsEdges.edgesTyped;
    // simulator.buffersLocal.logicalEdges = logicalEdges;
    simulator.dataframe.loadLocalBuffer('logicalEdges', logicalEdges);
    simulator.tickBuffers(['logicalEdges']);

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

    // simulator.resetBuffers([
    //     simulator.buffers.degrees,
    //     simulator.buffers.forwardsEdges,
    //     simulator.buffers.forwardsDegrees,
    //     simulator.buffers.forwardsWorkItems,
    //     simulator.buffers.backwardsEdges,
    //     simulator.buffers.backwardsDegrees,
    //     simulator.buffers.backwardsWorkItems,
    //     simulator.buffers.outputEdgeForcesMap,
    //     simulator.buffers.springsPos,
    //     simulator.buffers.midSpringsPos,
    //     simulator.buffers.forwardsEdgeStartEndIdxs,
    //     simulator.buffers.backwardsStartEndIdxs,
    //     simulator.buffers.midSpringsColorCoord
    // ]);

    // console.log('endPoints: ', endPoints, endPoints.constructor);

    return Q().then(function() {

        // Init constant
        simulator.dataframe.setNumElements('edge', numEdges);
        debug("Number of edges in simulation: %d", numEdges);

        // simulator.renderer.numEdges = simulator.numEdges;
        // simulator.numForwardsWorkItems = forwardsEdges.workItemsTyped.length / elementsPerWorkItem;
        // simulator.numBackwardsWorkItems = backwardsEdges.workItemsTyped.length / elementsPerWorkItem;

        simulator.dataframe.setNumElements('forwardsWorkItems', forwardsEdges.workItemsTyped.length / elementsPerWorkItem);
        simulator.dataframe.setNumElements('backwardsWorkItems', backwardsEdges.workItemsTyped.length / elementsPerWorkItem);
        simulator.dataframe.setNumElements('midPoints', midPoints.length / simulator.elementsPerPoint);
        simulator.dataframe.setNumElements('midEdges', numMidEdges);

        // simulator.numMidPoints = midPoints.length / simulator.elementsPerPoint;
        // simulator.renderer.numMidPoints = simulator.numMidPoints;
        // simulator.numMidEdges = (simulator.numSplits + 1) * simulator.numEdges;
        // simulator.renderer.numMidEdges = simulator.numMidEdges;

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
        // simulator.buffers.degrees = degreesBuffer;
        // simulator.buffers.forwardsEdges = forwardsEdgesBuffer;
        // simulator.buffers.forwardsDegrees = forwardsDegreesBuffer;
        // simulator.buffers.forwardsWorkItems = forwardsWorkItemsBuffer;
        // simulator.buffers.backwardsEdges = backwardsEdgesBuffer;
        // simulator.buffers.backwardsDegrees = backwardsDegreesBuffer;
        // simulator.buffers.backwardsWorkItems = backwardsWorkItemsBuffer;
        // simulator.buffers.nextMidPoints = nextMidPointsBuffer;
        // simulator.buffers.outputEdgeForcesMap = outputEdgeForcesMap;
        // simulator.buffers.globalCarryOut = globalCarryOut;
        // simulator.buffers.forwardsEdgeStartEndIdxs = forwardsEdgeStartEndIdxs;
        // simulator.buffers.backwardsEdgeStartEndIdxs = backwardsEdgeStartEndIdxs;
        // simulator.buffers.segStart = segStart;

        // simulator.renderer.buffers.springs = springsVBO;
        // simulator.renderer.buffers.curMidPoints = midPointsVBO;
        // simulator.renderer.buffers.midSprings = midSpringsVBO;
        // simulator.renderer.buffers.midSpringsColorCoord = midSpringsColorCoordVBO;

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
            // simulator.buffers.degrees.write(degrees),
            // simulator.buffers.forwardsEdges.write(forwardsEdges.edgesTyped),
            // simulator.buffers.forwardsDegrees.write(forwardsEdges.degreesTyped),
            // simulator.buffers.forwardsWorkItems.write(forwardsEdges.workItemsTyped),
            // simulator.buffers.backwardsEdges.write(backwardsEdges.edgesTyped),
            // simulator.buffers.backwardsDegrees.write(backwardsEdges.degreesTyped),
            // simulator.buffers.backwardsWorkItems.write(backwardsEdges.workItemsTyped),
            // simulator.buffers.forwardsEdgeStartEndIdxs.write(forwardsEdges.edgeStartEndIdxsTyped),
            // simulator.buffers.backwardsEdgeStartEndIdxs.write(backwardsEdges.edgeStartEndIdxsTyped),
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

        // simulator.buffers.springsPos = springsBuffer;
        // simulator.buffers.midSpringsPos = midSpringsBuffer;
        // simulator.buffers.curMidPoints = midPointsBuf;
        // simulator.buffers.midSpringsColorCoord = midSpringsColorCoordBuffer;
    })
    .then(function () {
        return Q.all([
            // simulator.buffers.springsPos.write(endPoints),
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
        setTimeSubset(renderer, simulator, simulator.timeSubset.relRange);
        return simulator;
    })
    .fail(eh.makeErrorHandler('Failure in SimCL.setEdges'));
}


/**
 * Sets the edge colors for the graph. With logical edges, edge colors are defined indirectly,
 * by giving a color for the source point and destination point.
 *
 * @param simulator - the simulator object to set the edges for
 * @param {Uint32Array} edgeColors - dense array of edge start and end colors
 */
function setEdgeColors(simulator, edgeColors) {
    if (!edgeColors) {
        debug('Using default edge colors');
        // var forwardsEdges = simulator.bufferHostCopies.forwardsEdges;
        var forwardsEdges = simulator.dataframe.getHostBuffer('forwardsEdges');
        edgeColors = new Uint32Array(forwardsEdges.edgesTyped.length);
        for (var i = 0; i < edgeColors.length; i++) {
            var nodeIdx = forwardsEdges.edgesTyped[i];
            edgeColors[i] = simulator.dataframe.getLocalBuffer('pointColors')[nodeIdx];
            // edgeColors[i] = simulator.buffersLocal.pointColors[nodeIdx];
        }
    }

    // simulator.buffersLocal.edgeColors = edgeColors;
    simulator.dataframe.loadLocalBuffer('edgeColors', edgeColors);
    simulator.tickBuffers(['edgeColors']);

    return simulator;
}

// TODO Write kernel for this.
function setMidEdgeColors(simulator, midEdgeColors) {
    var midEdgeColors, forwardsEdges, srcNodeIdx, dstNodeIdx, srcColorInt, srcColor,
        dstColorInt, dstColor, edgeIndex, midEdgeIndex, numSegments, lambda,
        colorHSVInterpolator, convertRGBInt2Color, convertColor2RGBInt, interpolatedColor;

    var numEdges = simulator.dataframe.getNumElements('edge');
    var numRenderedSplits = simulator.dataframe.getNumElements('renderedSplits');
    var numMidEdgeColors = numEdges * (numRenderedSplits + 1);


    if (!midEdgeColors) {
        debug('Using default midedge colors');
        midEdgeColors = new Uint32Array(4 * numMidEdgeColors);
        numSegments = numRenderedSplits + 1;
        forwardsEdges = simulator.dataframe.getHostBuffer('forwardsEdges');
        // forwardsEdges = simulator.bufferHostCopies.forwardsEdges;

        // Interpolate colors in the HSV color space.
        colorHSVInterpolator = function (color1, color2, lambda) {
            var color1HSV, color2HSV, h, s, v;
            color1HSV = color1.hsv();
            color2HSV = color2.hsv();
            h = color1HSV.h * (1 - lambda) + color2HSV.h * (lambda);
            s = color1HSV.s * (1 - lambda) + color2HSV.s * (lambda);
            v = color1HSV.v * (1 - lambda) + color2HSV.v * (lambda);
            return Color().hsv([h, s, v]);
        }

        // Convert from HSV to RGB Int
        convertColor2RGBInt = function (hsv) {
            var rgb = hsv.rgb();
            return (rgb.r << 0) + (rgb.g << 8) + (rgb.b << 16);
        }

        // Convert from RGB Int to HSV
        convertRGBInt2Color= function (rgbInt) {
            return Color().rgb({
                r:rgbInt & 0xFF,
                g:(rgbInt >> 8) & 0xFF,
                b:(rgbInt >> 16) & 0xFF
            });
        }

        for (edgeIndex = 0; edgeIndex < numEdges; edgeIndex++) {
            srcNodeIdx = forwardsEdges.edgesTyped[2 * edgeIndex];
            dstNodeIdx = forwardsEdges.edgesTyped[2 * edgeIndex + 1];

            srcColorInt = simulator.dataframe.getLocalBuffer('pointColors')[srcNodeIdx];
            dstColorInt = simulator.dataframe.getLocalBuffer('pointColors')[dstNodeIdx];

            // srcColorInt = simulator.buffersLocal.pointColors[srcNodeIdx];
            // dstColorInt = simulator.buffersLocal.pointColors[dstNodeIdx];

            srcColor = convertRGBInt2Color(srcColorInt);
            dstColor= convertRGBInt2Color(dstColorInt);

            interpolatedColor = convertColor2RGBInt(srcColor);

            for (midEdgeIndex = 0; midEdgeIndex < numSegments; midEdgeIndex++) {
                midEdgeColors[(2 * edgeIndex) * numSegments + (2 * midEdgeIndex)] =
                    interpolatedColor;
                lambda = (midEdgeIndex / numSegments);
                interpolatedColor =
                    convertColor2RGBInt(colorHSVInterpolator(srcColor, dstColor, lambda));
                midEdgeColors[(2 * edgeIndex) * numSegments + (2 * midEdgeIndex) + 1] =
                    interpolatedColor;
            }
        }
    }
    // simulator.buffersLocal.midEdgeColors = midEdgeColors;
    simulator.dataframe.loadLocalBuffer('midEdgeColors', midEdgeColors);
    simulator.tickBuffers(['midEdgeColors']);
    return simulator;
}

function setEdgeWeight(simulator, edgeWeights) {
    if (!edgeWeights) {
        debug('Using default edge weights');
        // var forwardsEdges = simulator.bufferHostCopies.forwardsEdges;
        var forwardsEdges = simulator.dataframe.getHostBuffer('forwardsEdges');
        edgeWeights = new Float32Array(forwardsEdges.edgesTyped.length);
        for (var i = 0; i < edgeWeights.length; i++) {
            edgeWeights[i] = 1.0;
        }
    }
    return simulator.cl.createBuffer(edgeWeights.byteLength, 'edgeWeights')
    .then(function(edgeWeightsBuffer) {
      return simulator.dataframe.loadBuffer('edgeWeights', 'simulator', edgeWeightsBuffer);
      // return simulator.buffers.edgeWeights = edgeWeightsBuffer;
    })
    .then(function() {
        return Q.all([
            // simulator.buffers.edgeWeights.write(endWeights),
            simulator.dataframe.writeBuffer('edgeWeights', 'simulator', edgeWeights, simulator)
        ]);
    }).then(function() {
        simulator.dataframe.loadLocalBuffer('edgeWeights', edgeWeights);
        // simulator.buffersLocal.edgeWeights = edgeWeights;
        simulator.tickBuffers(['edgeWeights']);

        return simulator;
    })
}

function setLocks(simulator, cfg) {
    _.extend(simulator.controls.locks, cfg || {});
}



function setPhysics(simulator, cfg) {
    debug('Simcl set physics', cfg)
    _.each(simulator.layoutAlgorithms, function (algo) {
        if (algo.name in cfg) {
            algo.setPhysics(cfg[algo.name]);
        }
    });
}

//renderer * simulator * {min: 0--100, max: 0--100}
function setTimeSubset(renderer, simulator, range) {


    //first point
    var startIdx = Math.round(renderer.numPoints * 0.01 * range.min);


    //all points before this
    var endIdx = Math.round((renderer.numPoints) * (0.01 * range.max));

    var numPoints = endIdx - startIdx;

    var pointToEdgeIdx = function (ptIdx, isBeginning) {

        var workItem = simulator.dataframe.getHostBuffer('forwardsEdges').srcToWorkItem[ptIdx];
        var workItemsTyped = simulator.dataframe.getHostBuffer('forwardsEdges').workItemsTyped;
        // var workItem = simulator.bufferHostCopies.forwardsEdges.srcToWorkItem[ptIdx];
        var idx = workItem;
        while (idx > 0 && (workItemsTyped[4 * idx] === -1)) {
            idx--;
        }

        var firstEdge = workItemsTyped[4 * idx];

        debug('pointToEdgeIdx', {ptIdx: ptIdx, workItem: workItem, idx: idx, firstEdge: firstEdge, isBeginning: isBeginning});

        if (idx == 0 && firstEdge == -1) {
            return 0;
        } else {
            if (!isBeginning) {
                var len = workItemsTyped[4 * idx + 1];
                firstEdge += len - 1;
            }
            return firstEdge;
        }
    };

    //first edge
    var startEdgeIdx = pointToEdgeIdx(startIdx, true);

    //all edges before this
    var endEdgeIdx = endIdx > 0 ? (pointToEdgeIdx(endIdx - 1, false) + 1) : startEdgeIdx;

    var numEdges = endEdgeIdx - startEdgeIdx;
    var numSplits = simulator.controls.global.numSplits;

    simulator.timeSubset =
        {relRange: range, //%
         pointsRange:       {startIdx: startIdx, len: numPoints},
         edgeRange:         {startIdx: startEdgeIdx * 2, len: numEdges * 2},
         midPointsRange:    {
                startIdx: startEdgeIdx *  numSplits,
                len: numEdges          *  numSplits},
         midEdgeRange:      {
                startIdx: startEdgeIdx * 2 * (1 + numSplits),
                len: numEdges * 2          * (1 + numSplits)}};

    debug('subset args', {numPoints: renderer.numPoints, numEdges: renderer.numEdges, startEdgeIdx: startEdgeIdx, endIdx: endIdx, endEdgeIdx: endEdgeIdx, numSplits:numSplits});


    simulator.tickBuffers([
        //points/edges
        'curPoints', 'nextPoints', 'springsPos',

        //style
        'edgeColors',

        //midpoints/midedges
        'curMidPoints', 'nextMidPoints', 'curMidPoints', 'midSpringsPos', 'midSpringsColorCoord'

        ].concat(_.keys(NAMED_CLGL_BUFFERS)));

}

function moveNodes(simulator, marqueeEvent) {
    debug('marqueeEvent', marqueeEvent);

    var drag = marqueeEvent.drag;
    var delta = {
        x: drag.end.x - drag.start.x,
        y: drag.end.y - drag.start.y,
    };

    var moveNodes = simulator.otherKernels.moveNodes;
    var springsGather = simulator.otherKernels.springsGather;

    return moveNodes.run(simulator, marqueeEvent.selection, delta)
        .then(function () {
            return springsGather.tick(simulator);
        }).fail(eh.makeErrorHandler('Failure trying to move nodes'));
}

function selectNodes(simulator, selection) {
    debug('selectNodes', selection);

    var selectNodes = simulator.otherKernels.selectNodes;

    return selectNodes.run(simulator, selection)
        .then(function (mask) {
            var res = [];
            for(var i = 0; i < mask.length; i++) {
                if (mask[i] === 1) {
                    res.push(i);
                }
            }
            return res;
        }).fail(eh.makeErrorHandler('Failure trying to compute selection'));
}

// Return the set of edge indices which are connected (either as src or dst)
// to nodes in nodeIndices
function connectedEdges(simulator, nodeIndices) {

    var forwardsBuffers = simulator.dataframe.getHostBuffer('forwardsEdges');
    var backwardsBuffers = simulator.dataframe.getHostBuffer('backwardsEdges');

    // var forwardsBuffers = simulator.bufferHostCopies.forwardsEdges;
    // var backwardsBuffers = simulator.bufferHostCopies.backwardsEdges;

    var setOfEdges = [];
    var edgeHash = {};

    var addOutgoingEdgesToSet = function (buffers, nodeIndices) {
        _.each(nodeIndices, function (idx) {
            var workItemId = buffers.srcToWorkItem[idx];
            var firstEdgeId = buffers.workItemsTyped[4*workItemId];
            var numEdges = buffers.workItemsTyped[4*workItemId + 1];
            var permutation = buffers.edgePermutationInverseTyped;

            for (var i = 0; i < numEdges; i++) {
                var edge = permutation[firstEdgeId + i];
                if (!edgeHash[edge]) {
                    setOfEdges.push(edge);
                    edgeHash[edge] = true;
                }
            }
        });
    }

    addOutgoingEdgesToSet(forwardsBuffers, nodeIndices);
    addOutgoingEdgesToSet(backwardsBuffers, nodeIndices);

    return setOfEdges;
}

function recolor(simulator, marquee) {
    console.log('Recoloring', marquee);
    var numPoints = simulator.dataframe.getNumElements('point');

    var positions = new ArrayBuffer(numPoints * 4 * 2);

    var selectedIdx = [];
    var bounds = marquee.selection;
    var curPointsBuffer = simulator.dataframe.getBuffer('curPoints', 'simulator');
    curPoints.read(new Float32Array(positions), 0).then(function () {
        var pos = new Float32Array(positions);
        for (var i = 0; i < numPoints; i++) {
            var x = pos[2*i];
            var y = pos[2*i + 1];
            if (x > bounds.tl.x && x < bounds.br.x && y < bounds.tl.y && y > bounds.br.y) {
                selectedIdx.push(i);
            }
        }

        _.each(selectedIdx, function (idx) {
            simulator.dataframe.setLocalBufferValue('pointSizes', idx, 255);
            // simulator.buffersLocal.pointSizes[idx] = 255;
            // console.log('Selected', simulator.pointLabels[idx]);
        })

        simulator.tickBuffers(['pointSizes']);
    }).fail(eh.makeErrorHandler('Read failed'));
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
        debug('No layout algs to run, early exit');
        return Q(simulator);
    }


    //run each algorithm to completion before calling next
    var tickAllHelper = function (remainingAlgorithms) {
        if (!remainingAlgorithms.length) return;
        var algorithm = remainingAlgorithms.shift();
        return Q()
            .then(function () {
                return algorithm.tick(simulator, stepNumber);
            })
            .then(function () {
                return tickAllHelper(remainingAlgorithms);
            }).then(function () {
                return simulator.otherKernels.springsGather.tick(simulator);
            });
    };

    return Q().then(function () {
        return tickAllHelper(simulator.layoutAlgorithms.slice(0));
    }).then(function() {
        if (stepNumber % 20 === 0 && stepNumber !== 0) {
            perf('Layout Perf Report (step: %d)', stepNumber);

            var extraKernels = [simulator.otherKernels.springsGather.gather];
            var totals = {};
            var runs = {}
            // Compute sum of means so we can print percentage of runtime
            _.each(simulator.layoutAlgorithms, function (la) {
               totals[la.name] = 0;
               runs[la.name] = 0;
                _.each(la.runtimeStats(extraKernels), function (stats) {
                    if (!isNaN(stats.mean)) {
                        totals[la.name] += stats.mean * stats.runs;
                        runs[la.name] += stats.runs;
                    }
                });
            });

            _.each(simulator.layoutAlgorithms, function (la) {
                var total = totals[la.name] / stepNumber;
                perf(sprintf('  %s (Total:%f) [ms]', la.name, total.toFixed(0)));
                _.each(la.runtimeStats(extraKernels), function (stats) {
                    var percentage = (stats.mean * stats.runs / totals[la.name] * 100);
                    perf(sprintf('\t%s        pct:%4.1f%%', stats.pretty, percentage));
                });
           });
        }
        // This cl.queue.finish() needs to be here because, without it, the queue appears to outside
        // code as running really fast, and tons of ticks will be called, flooding the GPU/CPU with
        // more stuff than they can handle.
        // What we really want here is to give finish() a callback and resolve the promise when it's
        // called, but node-webcl is out-of-date and doesn't support WebCL 1.0's optional callback
        // argument to finish().

        simulator.cl.queue.finish();
        perf('Tick Finished.');
        simulator.renderer.finish();
    }).fail(eh.makeErrorHandler('SimCl tick failed'));
}


module.exports = {
    'create': create
};

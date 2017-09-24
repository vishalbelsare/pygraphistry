'use strict';

const _ = require('underscore');
const Q = require('q');
const sprintf = require('sprintf-js').sprintf;
const util = require('./util.js');
import MoveNodes from './moveNodes.js';
import MoveNodesByIds from './moveNodesByIds.js';
import SelectNodesInRect from './SelectNodesInRect.js';
import SelectNodesInCircle from './SelectNodesInCircle.js';

// const HistogramKernel = require('./histogramKernel.js');

const log         = require('@graphistry/common').logger;
const logger      = log.createLogger('graph-viz','graph-viz/js/SimCL.js');

// const webcl = require('node-webcl');

// Do NOT enable this in prod. It destroys performance.
// Seriously.
// Q.longStackSupport = true;

/** @typedef {Object} Simulator
 * @property {Dataframe} dataframe
 * @property renderer
 * @property cl
 * @property {Number} elementsPerPoint
 * @property List<LayoutAlgo> layoutAlgorithms
 * @property Object otherKernels
 * @property {{tick: Number, buffers: Object<String, Number>}} versions
 */


/**
 * @param {Simulator} simObj
 * @param algos
 * @param {Dataframe} dataframe
 * @param controls
 * @param renderer
 * @param cl
 */
function createSimCL (simObj, algos, cl, renderer, controls, dataframe, kernelCache) {
    logger.trace('Creating SimCL...');

    simObj.layoutAlgorithms = algos;
    simObj.otherKernels = {
        moveNodes: new MoveNodes(cl, kernelCache),
        moveNodesByIds: new MoveNodesByIds(cl, kernelCache),
        selectNodesInRect: new SelectNodesInRect(cl, kernelCache),
        selectNodesInCircle: new SelectNodesInCircle(cl, kernelCache)
        // histogramKernel: new HistogramKernel(cl),
    };
    simObj.tilesPerIteration = 1;
    simObj.buffersLocal = {};

    simObj.tick = tick.bind(this, simObj);
    simObj.setPoints = setPoints.bind(this, simObj);
    simObj.setEdges = setEdges.bind(this, renderer, simObj);
    simObj.setSelectedPointIndexes = setSelectedPointIndexes.bind(this, simObj);
    simObj.setSelectedEdgeIndexes = setSelectedEdgeIndexes.bind(this, simObj);
    simObj.setLocks = setLocks.bind(this, simObj);
    simObj.setPhysics = setPhysics.bind(this, simObj);
    simObj.moveNodes = moveNodes.bind(this, simObj);
    simObj.moveNodesByIds = moveNodesByIds.bind(this, simObj);
    simObj.selectNodesInRect = selectNodesInRect.bind(this, simObj);
    simObj.selectNodesInCircle = selectNodesInCircle.bind(this, simObj);
    simObj.connectedEdges = connectedEdges.bind(this, simObj);
    simObj.resetBuffers = resetBuffers.bind(this, simObj);
    simObj.tickBuffers = tickBuffers.bind(this, simObj);
    simObj.setColor = setColor.bind(this, renderer, simObj);
    simObj.tickInitialBufferVersions = tickInitialBufferVersions.bind(this, simObj);

    simObj.numPoints = 0;
    simObj.numEdges = 0;
    simObj.numForwardsWorkItems = 0;
    simObj.numBackwardsWorkItems = 0;
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
        curPoints: null,
        degrees: null,
        forwardsEdges: null,
        backwardsEdges: null,
        outputEdgeForcesMap: null,
        forwardsEdgeStartEndIdxs: null,
        backwardsEdgeStartEndIdxs: null,
    };

    dataframe.setNumElements('point', renderer.numPoints);
    dataframe.setNumElements('edge', renderer.numEdges);
    dataframe.setNumElements('splits', controls.global.numSplits);
    dataframe.setNumElements('renderedSplits', controls.global.numRenderedSplits || 0);

    simObj.tickInitialBufferVersions();

    Object.seal(simObj.buffers);
    Object.seal(simObj);

    logger.trace('Simulator created');
}


/**
 * @param {Dataframe} dataframe
 * @param renderer
 * @param cl
 * @param {String} device
 * @param {String} vendor
 * @param {Object} cfg
 * @returns {Simulator}
 */
export function createSync (dataframe, renderer, cl, device, vendor, cfg, kernelCache) {
    // Pick the first layout algorithm that matches our device type

    // GPU device type
    const type = cl.deviceProps.TYPE.trim();

    // TODO Remove. Algorithms run on all devices
    var availableControls = _.filter(cfg,
        (algo) => true || _.contains(algo.devices, type));

    if (availableControls.length === 0) {
        logger.die('No layout controls satisfying device/vendor requirements', device, vendor);
    }

    const controls = availableControls[0];
    const layoutAlgorithms = controls.layoutAlgorithms;

    /** @type Simulator */
    const simObj = {
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

    const algos = _.map(layoutAlgorithms, (la) => {
        const algo = new la.algo(cl, kernelCache);
        algo.setPhysics(_.object(_.map(la.params, (p, name) => [name, p.value])));
        return algo;
    });

    createSimCL.call(this, simObj, algos, cl, renderer, controls, dataframe, kernelCache);

    return simObj;

}



// TODO: Deprecate this in favor of encodings.
function setColor (renderer, simulator, colorObj) {

    // TODO why are these reversed?
    const rgb =
        (colorObj.rgb.r << 0)
        + (colorObj.rgb.g << 8)
        + (colorObj.rgb.b << 16);

    const dataframe = simulator.dataframe;
    const ccManager = dataframe.computedColumnManager;

    // Set point colors
    const oldPointColorDesc = ccManager.getComputedColumnSpec('localBuffer', 'pointColors');
    const newPointColorDesc = oldPointColorDesc.clone();
    newPointColorDesc.setDependencies([]);
    newPointColorDesc.setComputeSingleValue(() => rgb);

    // Set edge colors
    const oldEdgeColorDesc = ccManager.getComputedColumnSpec('localBuffer', 'edgeColors');
    const newEdgeColorDesc = oldEdgeColorDesc.clone();
    newEdgeColorDesc.setDependencies([]);
    newEdgeColorDesc.setComputeSingleValue(() => [rgb, rgb]);

    ccManager.addComputedColumn(dataframe, 'localBuffer', 'pointColors', newPointColorDesc);
    ccManager.addComputedColumn(dataframe, 'localBuffer', 'edgeColors', newEdgeColorDesc);

    return Q();
}


//////////////////////////////////////////////////////////////////////////////
// Highlight shortest path code
// TODO: Bring it back in terms of encodings, toss somewhere besides simulator
//////////////////////////////////////////////////////////////////////////////

/**
 * @param {Simulator} simulator
 * @param {Number} src source point index
 * @param {Number} dst destination point index
 * @returns {Number} raises not found
 */
//function findEdgeDirected (simulator, src, dst) {
    //const buffers = simulator.dataframe.getHostBuffer('forwardsEdges');
    //const forwardsEdgeStartEndIdxs = simulator.dataframe.getBuffer('forwardsEdgeStartEndIdxs', 'simulator');

    //const workItem = buffers.srcToWorkItem[ src ];
    //const firstEdge = buffers.workItemsTyped[4 * workItem];
    //const numSiblings = buffers.workItemsTyped[4 * workItem + 1];
    //const start = forwardsEdgeStartEndIdxs[2 * workItem];
    //const stop = forwardsEdgeStartEndIdxs[2 * workItem + 1];
    //logger.warn({workItem, firstEdge, start, stop}, 'here');

    //if (firstEdge === -1) {
        //throw new Error('not found');
    //}

    //for (let sibling = 0; sibling < numSiblings; sibling++) {
        //const edge = firstEdge + sibling;
        //const sink = buffers.edgesTyped[2 * edge + 1];
        //if (sink === dst) {
            //return edge;
        //}
    //}

    //throw new Error('not found');
//}

/**
 * @param {Simulator} simulator
 * @param {Number} src source point index
 * @param {Number} dst destination point index
 * @returns {Number} raises not found
 */
//function findEdgeUndirected (simulator, src, dst) {
    //try {
        //return findEdgeDirected(simulator, src, dst);
    //} catch (ignore) {
        //return findEdgeDirected(simulator, dst, src);
    //}
//}

//function highlightPath (renderer, simulator, path, i) {
    //logger.error({i, path}, 'Highlgiht path');
    //if (path.length < 2) {
        //return;
    //}

    //const COLOR = -1 * util.palettes.qual_palette1[i % util.palettes.qual_palette1.length];

    //const points = _.union(path);
    //points.forEach((point) => {
        //if (point !== path[0] && point !== path[path.length -1]) {
            //simulator.dataframe.setLocalBufferValue('pointColors', point, COLOR);
        //}
    //});

    //const edges = _.zip(path.slice(0, -1), path.slice(1));
    //edges.forEach((pair[>, i<]) => {
        //const edge = findEdgeUndirected(simulator, pair[0], pair[1]);
        //simulator.dataframe.setLocalBufferValue('edgeColors', 2 * edge, COLOR);
        //simulator.dataframe.setLocalBufferValue('edgeColors', 2 * edge + 1, COLOR);
    //});
//}

//function highlightShortestPaths (renderer, simulator, pair) {
    //const MAX_PATHS = util.palettes.qual_palette1.length * 2;

    //const graph = new dijkstra.Graph();

    //for (let v = 0; v < renderer.numPoints; v++) {
        //graph.addVertex(v);
    //}
    //for (let e = 0; e < renderer.numEdges; e++) {
        //const src = simulator.dataframe.getHostBuffer('forwardsEdges').edgesTyped[2 * e];
        //const dst = simulator.dataframe.getHostBuffer('forwardsEdges').edgesTyped[2 * e + 1];

        //graph.addEdge(src, dst, 1);
        //graph.addEdge(dst, src, 1);
    //}

    //const paths = [];
    //const t0 = Date.now();
    //let ok = pair[0] !== pair[1];
    //while (ok && (Date.now() - t0 < 20 * 1000) && paths.length < MAX_PATHS) {

        //const path = dijkstra.dijkstra(graph, pair[0]);

        //if (path[pair[1]] === -1) {
            //ok = false;
        //} else {
            //const steps = [];
            //let step = pair[1];
            //while (step !== pair[0]) {
                //steps.push(step);
                //step = path[step];
            //}
            //steps.push(pair[0]);
            //steps.reverse();
            //paths.push(steps);

            //for (let i = 0; i < steps.length - 1; i++) {
                //graph.removeEdge(steps[i], steps[i + 1]);
            //}

        //}
    //}

    //paths.forEach(highlightPath.bind('', renderer, simulator));

    //let biggestPoint = Math.max(
        //simulator.dataframe.getLocalBuffer('pointSizes')[pair[0]],
        //simulator.dataframe.getLocalBuffer('pointSizes')[pair[1]]);
    //for (let i = 0; i < Math.min(10000, renderer.numPoints); i++) {
        //biggestPoint = Math.max(biggestPoint, simulator.dataframe.getLocalBuffer('pointSizes')[i]);
    //}
    //simulator.dataframe.setLocalBufferValue('pointSizes', pair[0], biggestPoint);
    //simulator.dataframe.setLocalBufferValue('pointSizes', pair[1], biggestPoint);

    //simulator.tickBuffers(['pointSizes', 'pointColors', 'edgeColors']);
//}

/**
 * Increase buffer version to tick number, signifying its contents may have changed
 * (Same version number signifies no change since last read of that buffer)
 * If not tick provided, increment global and use that
 * @param {Simulator} simulator
 * @param {String[]} bufferNames
 * @param {Number} tick
 **/
function tickBuffers (simulator, bufferNames, tick=undefined) {

    if (tick === undefined) {
        simulator.versions.tick++;
        tick = simulator.versions.tick;
    }

    if (bufferNames) {
        bufferNames.forEach((name) => {
            simulator.versions.buffers[name] = tick;
        });
    } else {
        _.keys(simulator.versions.buffers).forEach((name) => {
            simulator.versions.buffers[name] = tick;
            logger.trace('tick', name, tick);
        });
    }

}


/**
 * Given an array of (potentially null) buffers, delete the non-null buffers and set their
 * variable in the simulator buffer object to null.
 * NOTE: erase from host immediately, though device may take longer (unobservable)
 * @param {Simulator} simulator
 * @param {Object.<String, Number>} buffers
 */
 // TODO: Rewrite this to be cleaner (e.g., take name list)
function resetBuffers (simulator, buffers) {

    if (!buffers.length) {
        return;
    }

    const simulatorBuffers = simulator.dataframe.getAllBuffers('simulator');

    const buffNames = buffers
        .filter(_.identity)
        .map((buffer) => {
            for(const buff in simulatorBuffers) {
                if(simulatorBuffers.hasOwnProperty(buff) && simulatorBuffers[buff] === buffer) {
                    return buff;
                }
            }
            throw new Error('Could not find buffer', buffer);
        });

    tickBuffers(simulator, buffNames);

    // delete old
    buffNames.forEach((buffName) => {
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
function setPoints (simulator, points) {
    if(points.length < 1) {
        throw new Error('The points buffer is empty');
    }
    const elementsPerPoint = simulator.elementsPerPoint;
    if(points.length % elementsPerPoint !== 0) {
        throw new Error('The points buffer is an invalid size (must be a multiple of ' + elementsPerPoint + ')');
    }

    simulator.resetBuffers([
        simulator.dataframe.getBuffer('nextPoints', 'simulator'),
        simulator.dataframe.getBuffer('curPoints', 'simulator'),
    ]);

    const numPoints = points.length / elementsPerPoint;
    simulator.dataframe.setNumElements('point', numPoints);

    simulator.renderer.numPoints = numPoints;

    logger.debug('Number of points in simulation: %d', numPoints);

    return Q.all([
        simulator.renderer.createBuffer(points, 'curPoints'),
        simulator.cl.createBuffer(points.byteLength, 'nextPoints'),
    ])
    .spread((pointsVBO, nextPointsBuf) => {

        logger.trace('Created most of the points');

        simulator.dataframe.loadBuffer('nextPoints', 'simulator', nextPointsBuf);

        simulator.dataframe.loadRendererBuffer('curPoints', pointsVBO);

        return Q.all([
            simulator.cl.createBufferGL(pointsVBO, 'curPoints'),
        ]);
    })
    .spread((pointsBuf) => {
        simulator.dataframe.loadBuffer('curPoints', 'simulator', pointsBuf);
    })
    .then(() => {
        _.each(simulator.layoutAlgorithms, (la) => {
            la.setPoints(simulator);
        });
        return simulator;
    }).fail(log.makeQErrorHandler(logger, 'Failure in SimCl.setPoints'));
}

//function setMidEdges ( simulator ) {
    //logger.debug('In set midedges');
    //simulator.controls.locks.interpolateMidPointsOnce = true;

    //const numEdges = simulator.dataframe.getNumElements('edge');
    //const numSplits = simulator.dataframe.getNumElements('splits');

    //const bytesPerPoint = simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT;
    //const bytesPerEdge = 2 * bytesPerPoint;
    //const numMidPoints = ( numEdges * (numSplits) );

    //simulator.dataframe.setNumElements('midPoints', numMidPoints);
    //const numRenderedSplits = simulator.dataframe.getNumElements('renderedSplits');

    //const numMidEdges = ( numRenderedSplits + 1 ) * numEdges;
    //simulator.dataframe.setNumElements('midEdges', numMidEdges);
    //simulator.dataframe.setNumElements('numRenderedSplits', simulator.numRenderedSplits);
    //const midPointsByteLength = numMidPoints * bytesPerPoint;
    //// const springsByteLength = numEdges * bytesPerEdge;

    //simulator.dataframe.deleteBuffer('curMidPoints');
    //simulator.dataframe.deleteBuffer('nextMidPoints');

    //simulator.tickBuffers(['curMidPoints']);

    //return Q.all( [
        //simulator.cl.createBuffer( midPointsByteLength , 'nextMidPoints' ),
        //simulator.renderer.createBuffer( midPointsByteLength , 'curMidPoints' ),
        //simulator.renderer.createBuffer( simulator.numMidEdges * bytesPerEdge , 'midSprings' ),
    //] )
    //.spread( ( nextMidPointsBuffer , curMidPointsVBO , midSpringsVBO ) => {

        //simulator.dataframe.loadBuffer('nextMidPoints', 'simulator', nextMidPointsBuffer);
        //simulator.dataframe.loadRendererBuffer('curMidPoints', curMidPointsVBO);
        //simulator.dataframe.loadRendererBuffer('midSprings', midSpringsVBO);

        //return Q.all( [
            //simulator.cl.createBufferGL( curMidPointsVBO , 'curMidPoints' ),
            //simulator.cl.createBufferGL( midSpringsVBO , 'midSpringsPos' )
        //] );
    //} )
    //.spread( ( midPointsBuf , midSpringsBuf ) => {

        //simulator.dataframe.loadBuffer('midSpringsPos', 'simulator', midSpringsBuf);
        //simulator.dataframe.loadBuffer('curMidPoints', 'simulator', midPointsBuf);

        //return simulator;
    //} )
    //.then( () => {
        //simulator.setMidEdgeColors(undefined);
    //} )
    //.then( () => Q.all(
        //simulator.layoutAlgorithms.map((alg) => alg.setEdges(simulator))))
    //.fail( log.makeQErrorHandler(logger, 'Failure in SimCL.setMidEdges') );
//}

/**
 * Sets the edge list for the graph
 *
 * @param {Simulator} simulator - the simulator object to set the edges for
 * @param {{edgesTyped: Uint32Array, numWorkItems: Number, workItemsTyped: Int32Array}} forwardsEdges -
 *        Edge list as represented in input graph.
 *        edgesTyped is buffer where every two items contain the index of the source
 *        node for an edge, and the index of the target node of the edge.
 *        workItems is a buffer where every two items encode information needed by
 *         one thread: the index of the first edge it should process, and the number of
 *         consecutive edges it should process in total.
 * @param {{edgesTyped: Uint32Array, numWorkItems: Number, workItemsTypes: Uint32Array}} backwardsEdges -
 *        Same as forwardsEdges, except reverse edge src/dst and redefine workItems/numWorkItems correspondingly.
 * @param {Float32Array} midPoints - dense array of control points (packed sequence of nDim structs)
 * @returns {Promise<Simulator>} a promise for the simulator object
 */
function setEdges (renderer, simulator, unsortedEdges, forwardsEdges, backwardsEdges, degrees, endPoints, points) {
    // edges, workItems

    const nDim = simulator.controls.global.dimensions.length;
    const elementsPerEdge = 2; // The number of elements in the edges buffer per spring
    const elementsPerWorkItem = 4;
    const numSplits = simulator.dataframe.getNumElements('splits');
    const numEdges = forwardsEdges.edgesTyped.length / elementsPerEdge;
    const midPoints = new Float32Array((unsortedEdges.length / 2) * numSplits * nDim || 1);
    const numMidEdges = (numSplits + 1) * numEdges;
    const numPoints = simulator.dataframe.getNumElements('point');

    logger.debug('Number of midpoints: ', numSplits);

    if(forwardsEdges.edgesTyped.length < 1) {
        throw new Error('The edge buffer is empty');
    }
    if(forwardsEdges.edgesTyped.length % elementsPerEdge !== 0) {
        throw new Error('The edge buffer size is invalid (must be a multiple of ' + elementsPerEdge + ')');
    }
    if(forwardsEdges.workItemsTyped.length < 1) {
        throw new Error('The work items buffer is empty');
    }
    if(forwardsEdges.workItemsTyped.length % elementsPerWorkItem !== 0) {
        throw new Error('The work item buffer size is invalid (must be a multiple of ' + elementsPerWorkItem + ')');
    }

    simulator.dataframe.loadHostBuffer('unsortedEdges', unsortedEdges);
    simulator.dataframe.loadHostBuffer('forwardsEdges', forwardsEdges);
    simulator.dataframe.loadHostBuffer('backwardsEdges', backwardsEdges);

    simulator.tickBuffers(['forwardsEdgeStartEndIdxs', 'backwardsEdgeStartEndIdxs']);

    simulator.resetBuffers([

        simulator.dataframe.getBuffer('degrees', 'simulator'),
        simulator.dataframe.getBuffer('forwardsEdges', 'simulator'),
        simulator.dataframe.getBuffer('backwardsEdges', 'simulator'),
        simulator.dataframe.getBuffer('outputEdgeForcesMap', 'simulator'),
        simulator.dataframe.getBuffer('forwardsEdgeStartEndIdxs', 'simulator'),
        simulator.dataframe.getBuffer('backwardsStartEndIdxs', 'simulator'),
    ]);

    return Q().then(function() {

        // Init constant
        simulator.dataframe.setNumElements('edge', numEdges);
        logger.debug('Number of edges in simulation: %d', numEdges);

        simulator.dataframe.setNumElements('midPoints', midPoints.length / simulator.elementsPerPoint);
        simulator.dataframe.setNumElements('midEdges', numMidEdges);

        // Create buffers
        return Q.all([
            simulator.cl.createBuffer(degrees.byteLength, 'degrees'),
            simulator.cl.createBuffer(forwardsEdges.edgesTyped.byteLength, 'forwardsEdges'),
            simulator.cl.createBuffer(backwardsEdges.edgesTyped.byteLength, 'backwardsEdges'),
            simulator.cl.createBuffer(forwardsEdges.edgesTyped.byteLength, 'outputEdgeForcesMap'),
            simulator.cl.createBuffer(forwardsEdges.edgeStartEndIdxsTyped.byteLength, 'forwardsEdgeStartEndIdxs'),
            simulator.cl.createBuffer(backwardsEdges.edgeStartEndIdxsTyped.byteLength, 'backwardsEdgeStartEndIdxs'),
        ])
    })
    .spread((degreesBuffer, forwardsEdgesBuffer, backwardsEdgesBuffer, outputEdgeForcesMap,
            forwardsEdgeStartEndIdxs, backwardsEdgeStartEndIdxs
    ) => {
        // Bind buffers
        simulator.dataframe.loadBuffer('degrees', 'simulator', degreesBuffer);
        simulator.dataframe.loadBuffer('forwardsEdges', 'simulator', forwardsEdgesBuffer);
        simulator.dataframe.loadBuffer('backwardsEdges', 'simulator', backwardsEdgesBuffer);
        simulator.dataframe.loadBuffer('outputEdgeForcesMap', 'simulator', outputEdgeForcesMap);
        simulator.dataframe.loadBuffer('forwardsEdgeStartEndIdxs', 'simulator', forwardsEdgeStartEndIdxs);
        simulator.dataframe.loadBuffer('backwardsEdgeStartEndIdxs', 'simulator', backwardsEdgeStartEndIdxs);


        return Q.all([
            simulator.dataframe.writeBuffer('degrees', 'simulator', degrees, simulator),
            simulator.dataframe.writeBuffer('forwardsEdges', 'simulator', forwardsEdges.edgesTyped, simulator),
            simulator.dataframe.writeBuffer('backwardsEdges', 'simulator', backwardsEdges.edgesTyped, simulator),
            simulator.dataframe.writeBuffer('forwardsEdgeStartEndIdxs', 'simulator', forwardsEdges.edgeStartEndIdxsTyped, simulator),
            simulator.dataframe.writeBuffer('backwardsEdgeStartEndIdxs', 'simulator', backwardsEdges.edgeStartEndIdxsTyped, simulator)
        ]);
    })
    .then( () => {
        return Q.all(
            simulator.layoutAlgorithms
                .map((alg) => {
                    return alg.setEdges(simulator);
                }));
    })
    .then(() => {
        return simulator;
    })
    .fail(log.makeQErrorHandler(logger, 'Failure in SimCL.setEdges'));
}


function setSelectedEdgeIndexes (simulator, selectedEdgeIndexes) {
    // TODO call in same promise chain as other set calls.
    simulator.dataframe.loadLocalBuffer('selectedEdgeIndexes', selectedEdgeIndexes);
    simulator.tickBuffers(['selectedEdgeIndexes']);
}


function setSelectedPointIndexes (simulator, selectedPointIndexes) {
    // TODO call in same promise chain as other set calls.
    simulator.dataframe.loadLocalBuffer('selectedPointIndexes', selectedPointIndexes);
    simulator.tickBuffers(['selectedPointIndexes']);
}

// TODO Write kernel for this.
//function setMidEdgeColors (simulator, midEdgeColors) {
    //let [>midEdgeColors, <]forwardsEdges, srcNodeIdx, dstNodeIdx, srcColorInt, srcColor,
        //dstColorInt, dstColor, edgeIndex, midEdgeIndex, numSegments, lambda,
        //colorHSVInterpolator, convertRGBInt2Color, convertColor2RGBInt, interpolatedColorInt;

    //const numEdges = simulator.dataframe.getNumElements('edge');
    //const numRenderedSplits = simulator.dataframe.getNumElements('renderedSplits');
    //const numMidEdgeColors = numEdges * (numRenderedSplits + 1);

    //const interpolatedColor = {};
    //srcColor = {};
    //dstColor = {};

    //if (!midEdgeColors) {
        //logger.trace('Using default midedge colors');
        //midEdgeColors = new Uint32Array(4 * numMidEdgeColors);
        //numSegments = numRenderedSplits + 1;
        //forwardsEdges = simulator.dataframe.getHostBuffer('forwardsEdges');
        //// forwardsEdges = simulator.bufferHostCopies.forwardsEdges;

        //// Interpolate colors in the HSV color space.
        //colorHSVInterpolator = (color1, color2, lambda) => {
            //let color1HSV = color1.hsv(), color2HSV = color2.hsv();
            //const h1 = color1HSV.h;
            //const h2 = color2HSV.h;
            //const maxCCW = h1 - h2;
            //const maxCW =  (h2 + 360) - h1;
            //let hueStep;
            //if (maxCW > maxCCW) {
                ////hueStep = higherHue - lowerHue;
                ////hueStep = h2 - h1;
                //hueStep = h2 - h1;
            //} else {
                ////hueStep = higherHue - lowerHue;
                //hueStep = (360 + h2) - h1;
            //}
            //const h = (h1 + (hueStep * (lambda))) % 360;
            ////h = color1HSV.h * (1 - lambda) + color2HSV.h * (lambda);
            //const s = color1HSV.s * (1 - lambda) + color2HSV.s * (lambda);
            //const v = color1HSV.v * (1 - lambda) + color2HSV.v * (lambda);
            //return interpolatedColor.hsv([h, s, v]);
        //};

        //const colorRGBInterpolator = (color1, color2, lambda) => {
            //const r = color1.r * (1 - lambda) + color2.r * (lambda);
            //const g = color1.g * (1 - lambda) + color2.g * (lambda);
            //const b = color1.b * (1 - lambda) + color2.b * (lambda);
            //return {r, g, b};
        //};

        //// Convert from HSV to RGB Int
        //convertColor2RGBInt = (color) => {
            //return (color.r << 0) + (color.g << 8) + (color.b << 16);
        //};

        //// Convert from RGB Int to HSV
        //convertRGBInt2Color= (rgbInt) => {
            //return {
                //r:rgbInt & 0xFF,
                //g:(rgbInt >> 8) & 0xFF,
                //b:(rgbInt >> 16) & 0xFF
            //};
        //};

        //const pointColorsBuffer = simulator.dataframe.getLocalBuffer('pointColors');

        //for (edgeIndex = 0; edgeIndex < numEdges; edgeIndex++) {
            //srcNodeIdx = forwardsEdges.edgesTyped[2 * edgeIndex];
            //dstNodeIdx = forwardsEdges.edgesTyped[2 * edgeIndex + 1];

            //srcColorInt = pointColorsBuffer[srcNodeIdx];
            //dstColorInt = pointColorsBuffer[dstNodeIdx];

            //srcColor = convertRGBInt2Color(srcColorInt);
            //dstColor = convertRGBInt2Color(dstColorInt);

            //interpolatedColorInt = convertColor2RGBInt(srcColor);

            //for (midEdgeIndex = 0; midEdgeIndex < numSegments; midEdgeIndex++) {
                //midEdgeColors[(2 * edgeIndex) * numSegments + (2 * midEdgeIndex)] =
                    //interpolatedColorInt;
                //lambda = (midEdgeIndex + 1) / (numSegments);
                //interpolatedColorInt =
                    //convertColor2RGBInt(colorRGBInterpolator(srcColor, dstColor, lambda));
                //midEdgeColors[(2 * edgeIndex) * numSegments + (2 * midEdgeIndex) + 1] =
                    //interpolatedColorInt;
            //}
        //}
    //}
    //simulator.dataframe.loadLocalBuffer('midEdgeColors', midEdgeColors);
    //simulator.tickBuffers(['midEdgeColors']);
    //return Q(simulator);
//}

function setLocks (simulator, cfg) {
    _.extend(simulator.controls.locks, cfg || {});
    return Q();
}



function setPhysics (simulator, cfg) {
    logger.debug('SimCL set physics', cfg);
    _.each(simulator.layoutAlgorithms, (algo) => {
        if (algo.name in cfg) {
            algo.setPhysics(cfg[algo.name]);
        }
    });
    return Q();
}

function moveNodesByIds (simulator, ids, diff) {
    logger.debug('move nodes by ids: ', diff);

    const moveNodesByIdsKernel = simulator.otherKernels.moveNodesByIds;

    return moveNodesByIdsKernel.run(simulator, ids, diff)
        .fail(log.makeQErrorHandler(logger, 'Failure trying to move nodes by ids'));
}

function moveNodes (simulator, marqueeEvent) {
    logger.debug('marqueeEvent', marqueeEvent);

    const drag = marqueeEvent.drag;
    const delta = {
        x: drag.end.x - drag.start.x,
        y: drag.end.y - drag.start.y
    };

    const moveNodesKernel = simulator.otherKernels.moveNodes;

    return moveNodesKernel.run(simulator, marqueeEvent.selection, delta)
        .fail(log.makeQErrorHandler(logger, 'Failure trying to move nodes'));
}

function selectionKernelResultToMask (arrayOfBits) {
    const selectedIndexes = [];
    for (let i = 0; i < arrayOfBits.length; i++) {
        if (arrayOfBits[i] === 1) {
            selectedIndexes.push(i);
        }
    }
    return new Uint32Array(selectedIndexes);
}

function selectNodesInRect (simulator, selection) {
    logger.debug('selectNodesInRect', selection);

    if (selection.all) {
        const { dataframe } = simulator;
        const { lastMasks = {} } = dataframe;
        const numPoints = lastMasks.point ?
            lastMasks.point.length || 0 : dataframe.numPoints();
        return Q(_.range(0, numPoints));
    }

    return simulator.otherKernels.selectNodesInRect.run(simulator, selection)
        .then((arrayOfBits) => {
            return selectionKernelResultToMask(arrayOfBits);
        }).fail(log.makeQErrorHandler(logger, 'Failure trying to compute selection'));
}

function selectNodesInCircle (simulator, selection) {
    logger.debug('selectNodesInCircle', selection);

    if (selection.all) {
        const { dataframe } = simulator;
        const { lastMasks = {} } = dataframe;
        const numPoints = lastMasks.point ?
            lastMasks.point.length || 0 : dataframe.numPoints();
        return Q(_.range(0, numPoints));
    }

    return simulator.otherKernels.selectNodesInCircle.run(simulator, selection)
        .then((arrayOfBits) => {
            return selectionKernelResultToMask(arrayOfBits);
        }).fail(log.makeQErrorHandler(logger, 'Failure trying to compute selection'));
}

// Return the set of edge indices which are connected (either as src or dst)
// to nodes in nodeIndices
// Returns SORTED EDGE INDICES
// TODO: Move into dataframe, since it has the crazy sorted/unsorted knowledge?
function connectedEdges (simulator, nodeIndices) {

    // As far as I can tell this is not needed. Maybe for dataframe operations?
    const forwardsBuffers = simulator.dataframe.getHostBuffer('forwardsEdges');
    const backwardsBuffers = simulator.dataframe.getHostBuffer('backwardsEdges');
    const setOfEdges = [], edgeHash = [];
    let edgesLen = -1;

    const addOutgoingEdgesToSet = (buffers) => {
        _.each(nodeIndices, (idx) => {
            const workItemId = buffers.srcToWorkItem[idx];
            const firstEdgeId = buffers.workItemsTyped[4*workItemId];
            const numEdges = buffers.workItemsTyped[4*workItemId + 1];
            const permutation = buffers.edgePermutationInverseTyped;

            for (let i = 0; i < numEdges; i++) {
                const edge = permutation[firstEdgeId + i];
                if (!edgeHash[edge]) {
                    edgeHash[edge] = true;
                    setOfEdges[++edgesLen] = edge;
                }
            }
        });
    };

    addOutgoingEdgesToSet(forwardsBuffers);
    addOutgoingEdgesToSet(backwardsBuffers);

    return new Uint32Array(setOfEdges);
}

// TODO: Deprecate this fully once we don't have any versioned buffers
// attached directly to the simulator.
function tickInitialBufferVersions (simulator) {
    simulator.tickBuffers([
        // points/edges
        'curPoints', 'nextPoints',
        // style
        'edgeColors',
        // midpoints/midedges
        'curMidPoints', 'nextMidPoints', 'curMidPoints'
    ]);
}


/**
 * input positions: curPoints
 * output positions: nextPoints
 * @param {Simulator} simulator
 * @param {Number} stepNumber
 * @param {{play: Boolean, layout: Boolean}} cfg
 * @returns Promise<Simulator>
 */
function tick (simulator, stepNumber, cfg) {

    // If there are no points in the graph, don't run the simulation
    const numPoints = simulator.dataframe.getNumElements('point');
    if(numPoints < 1) {
        return Q(simulator);
    }

    simulator.versions.tick++;

    if (!cfg.layout) {
        logger.trace('No layout algs to run, early exit');
        return Q(simulator);
    }


    // run each algorithm to completion before calling next
    const tickAllHelper = (remainingAlgorithms) => {
        if (!remainingAlgorithms.length) { return Q(undefined); }
        const algorithm = remainingAlgorithms.shift();
        return Q()
            .then(() => {
                return algorithm.tick(simulator, stepNumber);
            })
            .then(() => {
                return tickAllHelper(remainingAlgorithms);
            });
    };

    return Q().then(
        () => tickAllHelper(simulator.layoutAlgorithms.slice(0))
    ).then(() => {
        if (stepNumber % 20 === 0 && stepNumber !== 0) {
            // TODO: move to perflogging
            logger.trace('Layout Perf Report (step: %d)', stepNumber);

            const totals = {};
            const runs = {};
            // Compute sum of means so we can print percentage of runtime
            _.each(simulator.layoutAlgorithms, (la) => {
                totals[la.name] = 0;
                runs[la.name] = 0;
            });
            _.each(simulator.layoutAlgorithms, (la) => {
                const total = totals[la.name] / stepNumber;
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

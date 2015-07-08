'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:canvas');
var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');
var _       = require('underscore');

var interaction     = require('./interaction.js');
var util            = require('./util.js');
var labels          = require('./labels.js');
var renderer        = require('../renderer');


function setupCameraInteractions(appState, $eventTarget) {
    var renderState = appState.renderState;
    var camera = renderState.get('camera');
    var canvas = renderState.get('canvas');

    //pan/zoom
    //Observable Event
    var interactions;
    if(interaction.isTouchBased) {
        debug('Detected touch-based device. Setting up touch interaction event handlers.');
        var eventTarget = $eventTarget[0];
        interactions = interaction.setupSwipe(eventTarget, camera)
            .merge(
                interaction.setupPinch($eventTarget, camera)
                .flatMapLatest(util.observableFilter(appState.anyMarqueeOn, util.notIdentity)));
    } else {
        debug('Detected mouse-based device. Setting up mouse interaction event handlers.');
        interactions = interaction.setupDrag($eventTarget, camera, appState)
            .merge(interaction.setupScroll($eventTarget, canvas, camera, appState));
    }

    return Rx.Observable.merge(
        interactions,
        interaction.setupRotate(camera),
        interaction.setupCenter($('#center'),
                                renderState.get('hostBuffers').curPoints,
                                camera),
        interaction.setupZoomButton($('#zoomin'), camera, 1 / 1.25)
            .flatMapLatest(util.observableFilter(appState.anyMarqueeOn, util.notIdentity)),
        interaction.setupZoomButton($('#zoomout'), camera, 1.25)
            .flatMapLatest(util.observableFilter(appState.anyMarqueeOn, util.notIdentity))
    );
}

/* Deindexed logical edges by looking up the x/y positions of the source and destination
 * nodes. */
function expandLogicalEdges(bufferSnapshots) {
    var logicalEdges = new Uint32Array(bufferSnapshots.logicalEdges.buffer);
    var curPoints = new Float32Array(bufferSnapshots.curPoints.buffer);
    var numVertices = logicalEdges.length;

    if (!bufferSnapshots.springsPos) {
        bufferSnapshots.springsPos = new Float32Array(numVertices * 2);
    }
    var springsPos = bufferSnapshots.springsPos;

    for (var i = 0; i < numVertices; i++) {
        springsPos[2 * i]     = curPoints[2 * logicalEdges[i]];
        springsPos[2 * i + 1] = curPoints[2 * logicalEdges[i] + 1];
    }

    return springsPos;
}

function setupLabelsAndCursor(appState, $eventTarget) {
    // Picks objects in priority based on order.
    var hitMapTextures = ['hitmap'];
    var latestHighlightedObject = labels.getLatestHighlightedObject(appState, $eventTarget, hitMapTextures);

    labels.setupCursor(appState.renderState, appState.renderingScheduler, appState.isAnimatingOrSimulating, latestHighlightedObject);
    labels.setupLabels(appState, $eventTarget, latestHighlightedObject);
}

function setupRenderUpdates(renderingScheduler, cameraStream, settingsChanges) {
    var renderUpdates = cameraStream.combineLatest(settingsChanges, _.identity);

    renderUpdates.do(function () {
        renderingScheduler.renderScene('panzoom', {trigger: 'renderSceneFast'});
    }).subscribe(_.identity, util.makeErrorHandler('render updates'));
}

function setupBackgroundColor(renderingScheduler, bgColor) {
    bgColor.do(function (rgb) {
        var color = [rgb.r/255, rgb.g/255, rgb.b/255, rgb.a === undefined ? 1 : rgb.a/255];
        renderingScheduler.renderState.get('options').clearColor = [color];
        renderingScheduler.renderScene('bgcolor', {trigger: 'renderSceneFast'});
    }).subscribe(_.identity, util.makeErrorHandler('bg color updates'));
}

function getPolynomialCurves(bufferSnapshots) {
    var logicalEdges = new Uint32Array(bufferSnapshots.logicalEdges.buffer);
    var curMidPoints = new Float32Array(bufferSnapshots.curMidPoints.buffer);
    var curPoints = new Float32Array(bufferSnapshots.curPoints.buffer);
    var numSplits = curMidPoints.length  / logicalEdges.length;
    var numRenderedSplits = 8;

    //var numEdgesRendered = 3;

    if (numSplits < 1) {
        numSplits = 0;
    }
    //var numMidEdges = numSplits + 1;
    var numEdges = (logicalEdges.length / 2);

    var numVertices = (2 * numEdges) * (numRenderedSplits + 1);

    if (!bufferSnapshots.midSpringsPos) {
        bufferSnapshots.midSpringsPos = new Float32Array(numVertices * 2);
    }
    var midSpringsPos = bufferSnapshots.midSpringsPos;

    var edge = {
        srcPoint: new Float32Array(2),
        dstPoint: new Float32Array(2),
        midPoint: new Float32Array(2),
        length: 0,
        transformationMatrix: new Float32Array(4),
        transformationMatrixInv: new Float32Array(4),
    };

    Object.seal(edge);

    var edgeVector = new Float32Array(2);

    // These variables are used to initialize an expanded edge. We declare them
    // outside the expandEdge function in order to save memory.
    var srcPointIdx, dstPointIdx, midEdgeIndex, theta, cos, sin;
    function expandEdge(edge, edgeIndex) {
        srcPointIdx = logicalEdges[edgeIndex * 2];
        dstPointIdx = logicalEdges[(edgeIndex * 2) + 1];

        edge.srcPoint[0] = curPoints[(2 * srcPointIdx)];
        edge.srcPoint[1] = curPoints[(2 * srcPointIdx)+ 1];
        edge.dstPoint[0] = curPoints[(2 * dstPointIdx)];
        edge.dstPoint[1] = curPoints[(2 * dstPointIdx) + 1];
        // TODO this can be removed or should be generalized to multiple midpoints.
        midEdgeIndex = 0;
        edge.midPoint[0] = curMidPoints[(edgeIndex * 2 * (numSplits)) + (midEdgeIndex * 2)];
        edge.midPoint[1] = curMidPoints[(edgeIndex * 2 * (numSplits)) + (midEdgeIndex * 2) + 1];

        edgeVector[0] = edge.dstPoint[0] - edge.srcPoint[0];
        edgeVector[1] = edge.dstPoint[1] - edge.srcPoint[1];

        edge.length = Math.pow(Math.pow(edgeVector[0], 2) + Math.pow(edgeVector[1], 2), 0.5);

        theta = Math.atan2(edgeVector[1], edgeVector[0]);

        cos = Math.cos(theta);
        sin = Math.sin(theta);

        edge.transformationMatrix[0] = cos;
        edge.transformationMatrix[1] = sin;
        edge.transformationMatrix[2] = -sin;
        edge.transformationMatrix[3] = cos;

        edge.transformationMatrixInv[0] = cos;
        edge.transformationMatrixInv[1] = -sin;
        edge.transformationMatrixInv[2] = sin;
        edge.transformationMatrixInv[3] = cos;
    }

    var diffVector = new Float32Array(2);
    function toEdgeBasisMem(vector, tranformationMatrix, srcPoint, output) {
        diffVector[0] = vector[0] - srcPoint[0];
        diffVector[1] = vector[1] - srcPoint[1];
        output[0] = tranformationMatrix[0] * diffVector[0] + tranformationMatrix[1] * diffVector[1];
        output[1] = tranformationMatrix[2] * diffVector[0] + tranformationMatrix[3] * diffVector[1];
    }

    function fromEdgeBasisMem(vector, transformationMatrixInv, srcPoint, output) {
        output[0] = srcPoint[0] + (transformationMatrixInv[0] * vector[0] + transformationMatrixInv[1] * vector[1]);
        output[1] = srcPoint[1] + (transformationMatrixInv[2] * vector[0] + transformationMatrixInv[3] * vector[1]);
    }

    function getQuadratic(x) {
        return [Math.pow(x, 2), x, 1];
    }

    function inverseMem(matrix, mem) {
        var det = matrix[0] * ((matrix[4] * matrix[8]) - (matrix[5] * matrix[7])) -
            matrix[1] * ((matrix[3] * matrix[8]) - (matrix[5] * matrix[6])) +
            matrix[2] * ((matrix[3] * matrix[7]) - (matrix[4] * matrix[6]));
        // First row
        mem[0] = ((matrix[4] * matrix[8]) - (matrix[5] * matrix[7])) / det;
        mem[1] = ((matrix[2] * matrix[7]) - (matrix[1] * matrix[8])) / det;
        mem[2] = ((matrix[1] * matrix[5]) - (matrix[2] * matrix[4])) / det;

        // Second Row
        mem[3] = ((matrix[5] * matrix[6]) - (matrix[3] * matrix[8])) / det;
        mem[4] = ((matrix[1] * matrix[8]) - (matrix[2] * matrix[6])) / det;
        mem[5] = ((matrix[2] * matrix[3]) - (matrix[1] * matrix[5])) / det;

        // Third Row
        mem[6] = ((matrix[3] * matrix[7]) - (matrix[4] * matrix[6])) / det;
        mem[7] = ((matrix[1] * matrix[6]) - (matrix[1] * matrix[7])) / det;
        mem[8] = ((matrix[1] * matrix[4]) - (matrix[1] * matrix[4])) / det;
    }

    var transformedDstPoint = new Float32Array(2);
    var transformedMidPoint = new Float32Array(2);
    var curveParameters = new Float32Array(3);
    var yVector = new Float32Array(3);
    var invX = new Float32Array(9);
    function getCurveParameters(edge) {
        toEdgeBasisMem(edge.dstPoint, edge.transformationMatrix, edge.srcPoint, transformedDstPoint);
        toEdgeBasisMem(edge.midPoint, edge.transformationMatrix, edge.srcPoint, transformedMidPoint);
        yVector[0] = 0;
        yVector[1] = transformedMidPoint[1];
        yVector[2] = transformedDstPoint[1];
        var xVector = [0, 0, 1,
                       Math.pow(transformedMidPoint[0], 2), transformedMidPoint[0], 1,
                       Math.pow(transformedDstPoint[0], 2), transformedDstPoint[0], 1];

        inverseMem(xVector, invX);
        curveParameters[0] = (invX[0] * yVector[0]) + (invX[1] * yVector[1]) + (invX[2] * yVector[2]);
        curveParameters[1] = (invX[3] * yVector[0]) + (invX[4] * yVector[1]) + (invX[5] * yVector[2]);
        curveParameters[2] = (invX[6] * yVector[0]) + (invX[7] * yVector[1]) + (invX[8] * yVector[2]);
    }

    function computePolynomial(x, betaVector) {
        var quadratic = getQuadratic(x);
        return (quadratic[0] * betaVector[0]) + (quadratic[1] * betaVector[1]) + (quadratic[2] * betaVector[2]);
    }

    function getMidPointPosition(edge, betaVector, lambda) {
        var x;
        x = lambda * edge.length;
        var vector = [x, computePolynomial(x, betaVector)];
        fromEdgeBasisMem(vector, edge.transformationMatrixInv, edge.srcPoint, dstMidPoint);
        //return midPointMem.slice();
    }

    function setMidEdge(edgeIdx, midEdgeIdx, srcPoint, dstPoint) {
        var index = midEdgeStartIdx + (midEdgeIdx * 4);
        midSpringsPos[index] = srcPoint[0];
        midSpringsPos[index + 1] = srcPoint[1];
        midSpringsPos[index + 2] = dstPoint[0];
        midSpringsPos[index + 3] = dstPoint[1];
    }


    var srcMidPoint = new Float32Array(2);
    var dstMidPoint = new Float32Array(2);
    var elementsPerPoint = 2;
    var pointsPerEdge = 2;
    var midEdgesPerEdge = numRenderedSplits + 1;
    var midEdgeStride = elementsPerPoint * pointsPerEdge * midEdgesPerEdge;
    for (var edgeIndex = 0; edgeIndex < numEdges; edgeIndex += 1) {

        var midEdgeStartIdx = edgeIndex * midEdgeStride;
        expandEdge(edge, edgeIndex);
        getCurveParameters(edge);

        // Set first midpoint to source point of edge
        srcMidPoint[0] = edge.srcPoint[0];
        srcMidPoint[1] = edge.srcPoint[1];

        for (var midEdgeIdx = 0; midEdgeIdx < (numRenderedSplits); midEdgeIdx++) {
            var lambda = (midEdgeIdx + 1) / (numRenderedSplits + 1);
            getMidPointPosition(edge, curveParameters, lambda);
            //var dstPoint = midPointMem.slice();
            setMidEdge(edgeIndex, midEdgeIdx, srcMidPoint, dstMidPoint);
            srcMidPoint[0] = dstMidPoint[0];
            srcMidPoint[1] = dstMidPoint[1];
        }

        // Set last midedge position to previous midpoint and edge destination
        setMidEdge(edgeIndex, numRenderedSplits, srcMidPoint, edge.dstPoint);
    }

    return midSpringsPos;
}

/* Populate arrow buffers. The first argument is either an array of indices,
 * or an integer value of how many you want.
 */
function populateArrowBuffers (maybeIterable, springsPos, arrowStartPos,
        arrowEndPos, arrowNormalDir, pointSizes, logicalEdges,
        arrowPointSizes, arrowColors, edgeColors) {

    var isIterable = maybeIterable.constructor === Array;
    var forLimit = (isIterable) ? maybeIterable.length : maybeIterable;

    for (var idx = 0; idx < forLimit; idx++) {
        var val = (isIterable) ? maybeIterable[idx] : idx;

        var start = [springsPos[4*val + 0], springsPos[4*val + 1]];
        var end   = [springsPos[4*val + 2], springsPos[4*val + 3]];

        arrowStartPos[6*idx + 0] = start[0];
        arrowStartPos[6*idx + 1] = start[1];
        arrowStartPos[6*idx + 2] = start[0];
        arrowStartPos[6*idx + 3] = start[1];
        arrowStartPos[6*idx + 4] = start[0];
        arrowStartPos[6*idx + 5] = start[1];

        arrowEndPos[6*idx + 0] = end[0];
        arrowEndPos[6*idx + 1] = end[1];
        arrowEndPos[6*idx + 2] = end[0];
        arrowEndPos[6*idx + 3] = end[1];
        arrowEndPos[6*idx + 4] = end[0];
        arrowEndPos[6*idx + 5] = end[1];

        arrowNormalDir[3*idx + 0] = 0;  // Tip vertex
        arrowNormalDir[3*idx + 1] = 1;  // Left vertex
        arrowNormalDir[3*idx + 2] = -1; // Right vertex

        var pointSize = pointSizes[logicalEdges[2*val + 1]];
        arrowPointSizes[3*idx + 0] = pointSize;
        arrowPointSizes[3*idx + 1] = pointSize;
        arrowPointSizes[3*idx + 2] = pointSize;

        arrowColors[3*idx + 0] = edgeColors[2*val + 1];
        arrowColors[3*idx + 1] = edgeColors[2*val + 1];
        arrowColors[3*idx + 2] = edgeColors[2*val + 1];

    }
}


function makeArrows(bufferSnapshots) {
    var logicalEdges = new Uint32Array(bufferSnapshots.logicalEdges.buffer);
    var pointSizes = new Uint8Array(bufferSnapshots.pointSizes.buffer);
    var springsPos = new Float32Array(bufferSnapshots.springsPos.buffer);
    var edgeColors = new Uint32Array(bufferSnapshots.edgeColors.buffer);
    var numEdges = springsPos.length / 4; // TWO coords (x,y) for each of the TWO endpoints.

    if (!bufferSnapshots.arrowStartPos) {
        bufferSnapshots.arrowStartPos = new Float32Array(numEdges * 2 * 3);
    }
    var arrowStartPos = bufferSnapshots.arrowStartPos;

    if (!bufferSnapshots.arrowEndPos) {
        bufferSnapshots.arrowEndPos = new Float32Array(numEdges * 2 * 3);
    }
    var arrowEndPos = bufferSnapshots.arrowEndPos;

    if (!bufferSnapshots.arrowNormalDir) {
        bufferSnapshots.arrowNormalDir = new Float32Array(numEdges * 3);
    }
    var arrowNormalDir = bufferSnapshots.arrowNormalDir;

    if (!bufferSnapshots.arrowColors) {
        bufferSnapshots.arrowColors = new Uint32Array(numEdges * 3);
    }
    var arrowColors = bufferSnapshots.arrowColors;

    if (!bufferSnapshots.arrowPointSizes) {
        bufferSnapshots.arrowPointSizes = new Uint8Array(numEdges * 3);
    }
    var arrowPointSizes = bufferSnapshots.arrowPointSizes;

    populateArrowBuffers(numEdges, springsPos, arrowStartPos,
            arrowEndPos, arrowNormalDir, pointSizes, logicalEdges,
            arrowPointSizes, arrowColors, edgeColors);
}

/*
 * Render expensive items (eg, edges) when a quiet state is detected. This function is called
 * from within an animation frame and must execture all its work inside it. Callbacks(rx, etc)
 * are not allowed as they would schedule work outside the animation frame.
 */
function renderSlowEffects(renderingScheduler) {
    var appSnapshot = renderingScheduler.appSnapshot;
    var renderState = renderingScheduler.renderState;
    var logicalEdges = renderState.get('config').get('edgeMode') === 'INDEXEDCLIENT';
    var springsPos;
    var midSpringsPos;


    if (logicalEdges && appSnapshot.vboUpdated) {
        var start = Date.now();
        if (appSnapshot.buffers.curMidPoints) {
            midSpringsPos = getPolynomialCurves(appSnapshot.buffers);
            renderer.loadBuffers(renderState, {'midSpringsPosClient': midSpringsPos});
        } else {
            springsPos = expandLogicalEdges(appSnapshot.buffers);
            renderer.loadBuffers(renderState, {'springsPosClient': springsPos});
        }
        var end1 = Date.now();
        //renderer.loadBuffers(renderState, {'springsPosClient': springsPos});
        var end2 = Date.now();
        console.info('Edges expanded in', end1 - start, '[ms], and loaded in', end2 - end1, '[ms]');

        if (!appSnapshot.buffers.curMidPoints) {
            makeArrows(appSnapshot.buffers);
            var end3 = Date.now();
            renderer.loadBuffers(renderState, {'arrowStartPos': appSnapshot.buffers.arrowStartPos});
            renderer.loadBuffers(renderState, {'arrowEndPos': appSnapshot.buffers.arrowEndPos});
            renderer.loadBuffers(renderState, {'arrowNormalDir': appSnapshot.buffers.arrowNormalDir});
            renderer.loadBuffers(renderState, {'arrowColors': appSnapshot.buffers.arrowColors});
            renderer.loadBuffers(renderState, {'arrowPointSizes': appSnapshot.buffers.arrowPointSizes});
            renderer.setNumElements(renderState, 'arrowculled', appSnapshot.buffers.arrowStartPos.length / 2);
            var end4 = Date.now();
            console.info('Arrows generated in ', end3 - end2, '[ms], and loaded in', end4 - end3, '[ms]');
        }
    }

    renderer.setCamera(renderState);
    renderer.render(renderState, 'fullscene', 'renderSceneFull');
    renderer.render(renderState, 'picking', 'picking', undefined, undefined, function () {
        renderingScheduler.appSnapshot.hitmapUpdates.onNext();
    });
    renderer.copyCanvasToTexture(renderState, 'steadyStateTexture');
}

/*
 * Render mouseover effects. These should only occur during a quiet state.
 *
 */
 var lastHighlightedEdge = -1;

// TODO: Make this work on safari.
function renderMouseoverEffects(renderingScheduler, task) {
    var appSnapshot = renderingScheduler.appSnapshot;
    var renderState = renderingScheduler.renderState;
    var buffers = appSnapshot.buffers;

    // We haven't received any VBOs yet, so we shouldn't attempt to render.
    if (!buffers.logicalEdges) {
        return;
    }

    var logicalEdges = new Uint32Array(buffers.logicalEdges.buffer);
    var hostBuffers = renderState.get('hostBuffersCache');

    var edgeIndices = task.data.edgeIndices || [];
    var nodeIndices = task.data.nodeIndices || [];

    // Extend node indices with edge endpoints
    // TODO: Decide if we need to dedupe.
    _.each(edgeIndices, function (val) {
        nodeIndices.push(logicalEdges[2*val]);
        nodeIndices.push(logicalEdges[2*val + 1]);
    });

    var hostNodePositions = new Float32Array(hostBuffers.curPoints.buffer);
    var hostNodeSizes = hostBuffers.pointSizes;

    // Don't render if nothing has changed
    if (lastHighlightedEdge === edgeIndices[0]) {
        return;
    }
    lastHighlightedEdge = edgeIndices[0];

    if (buffers.highLightedEdges) {
        // TODO: Start with a small buffer and increase if necessary, masking underlying
        // data so we don't have to clear out later values. This way we won't have to constantly allocate
        buffers.highlightedEdges = new Float32Array(edgeIndices.length * 4);
        buffers.highlightedNodePositions = new Float32Array(nodeIndices.length * 2);
        buffers.highlightedNodeSizes = new Uint8Array(nodeIndices.length);
        buffers.highlightedArrowStartPos = new Float32Array(edgeIndices.length * 2 * 3);
        buffers.highlightedArrowEndPos = new Float32Array(edgeIndices.length * 2 * 3);
        buffers.highlightedArrowNormalDir = new Float32Array(edgeIndices.length * 3);
        buffers.highlightedArrowColors = new Uint32Array(edgeIndices.length * 3);
        buffers.highlightedArrowPointSizes = new Uint8Array(edgeIndices.length * 3);

        renderer.setNumElements(renderState, 'edgehighlight', edgeIndices.length * 2);
        renderer.setNumElements(renderState, 'pointhighlight', nodeIndices.length);
        renderer.setNumElements(renderState, 'arrowhighlight', edgeIndices.length * 3);

        _.each(edgeIndices, function (val, idx) {
            buffers.highlightedEdges[idx*4] = buffers.springsPos[val*4];
            buffers.highlightedEdges[idx*4 + 1] = buffers.springsPos[val*4 + 1];
            buffers.highlightedEdges[idx*4 + 2] = buffers.springsPos[val*4 + 2];
            buffers.highlightedEdges[idx*4 + 3] = buffers.springsPos[val*4 + 3];
        });

        _.each(nodeIndices, function (val, idx) {
            buffers.highlightedNodePositions[idx*2] = hostNodePositions[val*2];
            buffers.highlightedNodePositions[idx*2 + 1] = hostNodePositions[val*2 + 1];

            buffers.highlightedNodeSizes[idx] = hostNodeSizes[val];
        });

        populateArrowBuffers(edgeIndices, buffers.springsPos, buffers.highlightedArrowStartPos,
                buffers.highlightedArrowEndPos, buffers.highlightedArrowNormalDir, hostNodeSizes,
                logicalEdges, buffers.highlightedArrowPointSizes, buffers.highlightedArrowColors,
                buffers.edgeColors);

        renderer.setupFullscreenBuffer(renderState);
        renderer.loadBuffers(renderState, {
            'highlightedEdgesPos': buffers.highlightedEdges,
            'highlightedPointsPos': buffers.highlightedNodePositions,
            'highlightedPointsSizes': buffers.highlightedNodeSizes,
            'highlightedArrowStartPos': buffers.highlightedArrowStartPos,
            'highlightedArrowEndPos': buffers.highlightedArrowEndPos,
            'highlightedArrowNormalDir': buffers.highlightedArrowNormalDir,
            'highlightedArrowPointSizes': buffers.highlightedArrowPointSizes
        });
    }
    renderer.setCamera(renderState);
    renderer.render(renderState, 'highlight', 'highlight');
}


var RenderingScheduler = function(renderState, vboUpdates, hitmapUpdates,
                                  isAnimating, simulateOn) {
    var that = this;
    this.renderState = renderState;

    /* Rendering queue */
    var renderTasks = new Rx.Subject();
    var renderQueue = {};
    var renderingPaused = true; // False when the animation loop is running.

    /* Since we cannot read out of Rx streams withing the animation frame, we record the latest
     * value produced by needed rx streams and pass them as function arguments to the quiet state
     * callback. */
    this.appSnapshot = {
        vboUpdated: false,
        simulating: false,
        quietState: false,
        buffers: {
            curPoints: undefined,
            curMidPoints: undefined,
            pointSizes: undefined,
            logicalEdges: undefined,
            springsPos: undefined,
            midSpringsPos: undefined,
            highlightedEdges: undefined,
            highlightedNodePositions: undefined,
            highlightedNodeSizes: undefined,
            edgeColors: undefined,
            arrowStartPos: undefined,
            arrowEndPos: undefined,
            arrowNormalDir: undefined,
            arrowColors: undefined,
            arrowPointSizes: undefined,
            highlightedArrowStartPos: undefined,
            highlightedArrowEndPos: undefined,
            highlightedArrowNormalDir: undefined,
            highlightedArrowColors: undefined,
            highlightedArrowPointSizes: undefined
        },
        hitmapUpdates: hitmapUpdates
    };

    Object.seal(this.appSnapshot);
    Object.seal(this.appSnapshot.buffers);


    /* Set up fullscreen buffer for mouseover effects.
     *
     */
    renderer.setupFullscreenBuffer(renderState);


    /*
     * Rx hooks to maintain the appSnaphot up-to-date
     */
    simulateOn.subscribe(function (val) {
        that.appSnapshot.simulating = val;
    }, util.makeErrorHandler('simulate updates'));

    vboUpdates.filter(function (status) {
        return status === 'received';
    }).flatMapLatest(function () {
        var hostBuffers = renderState.get('hostBuffers');
        var bufUpdates = ['curPoints', 'logicalEdges', 'edgeColors', 'pointSizes', 'curMidPoints'].map(function (bufName) {
            var bufUpdate = hostBuffers[bufName] || Rx.Observable.return();
            return bufUpdate.do(function (data) {
                that.appSnapshot.buffers[bufName] = data;
            });
        });
        return bufUpdates[0]
            .combineLatest(bufUpdates[1], bufUpdates[2], bufUpdates[3], bufUpdates[4], _.identity);
    }).do(function () {
        that.appSnapshot.vboUpdated = true;
        that.renderScene('vboupdate', {trigger: 'renderSceneFast'});
        that.renderScene('vboupdate_picking', {
            items: ['pointsampling'],
            callback: function () {
                hitmapUpdates.onNext();
            }
        });
    }).subscribe(_.identity, util.makeErrorHandler('render vbo updates'));


    /* Push a render task into the renderer queue
     * String * {trigger, items, readPixels, callback} -> () */
    this.renderScene = function(tag, task) {
        renderTasks.onNext({
            tag: tag,
            trigger: task.trigger,
            items: task.items,
            readPixels: task.readPixels,
            callback: task.callback,
            data: task.data
        });
    };

    /* Move render tasks into a tagged dictionary. For each tag, only the latest task
     * is rendered; others are skipepd. */
    renderTasks.subscribe(function (task) {
        debug('Queueing frame on behalf of', task.tag);
        renderQueue[task.tag] = task;

        if (renderingPaused) {
            startRenderingLoop();
        }
    });


    /*
     * Helpers to start/stop the rendering loop within an animation frame. The rendering loop
     * stops when idle for a second and starts again at the next render update.
     */
    function startRenderingLoop() {
        var lastRenderTime = 0;
        var quietSignaled = true;

        function loop() {
            var nextFrameId = window.requestAnimationFrame(loop);

            // Nothing to render
            if (_.keys(renderQueue).length === 0) {
                var timeDelta = Date.now() - lastRenderTime;
                if (timeDelta > 200 && !quietSignaled) {
                    quietCallback();
                    quietSignaled = true;
                    isAnimating.onNext(false);
                }

                if (timeDelta > 1000) {
                    pauseRenderingLoop(nextFrameId);
                }
                return;
            }

            // Mouseover interactions
            // TODO: Generalize this as a separate category?
            if (_.keys(renderQueue).indexOf('mouseOver') > -1) {
                // TODO: Handle mouseover interaction
                renderMouseoverEffects(that, renderQueue.mouseOver);
                delete renderQueue.mouseOver;
            }

            // Rest render queue
            if (_.keys(renderQueue).length > 0) {
                lastRenderTime = Date.now();
                if (quietSignaled) {
                    isAnimating.onNext(true);
                    quietSignaled = false;
                    that.appSnapshot.quietState = false;
                }

                renderer.setCamera(renderState);
                _.each(renderQueue, function (renderTask, tag) {
                    renderer.render(renderState, tag, renderTask.trigger, renderTask.items,
                                    renderTask.readPixels, renderTask.callback);
                });
                renderQueue = {};
            }
        }

        debug('Starting rendering loop');
        renderingPaused = false;
        loop();
    }

    function pauseRenderingLoop(nextFrameId) {
        debug('Pausing rendering loop');
        window.cancelAnimationFrame(nextFrameId);
        renderingPaused = true;
    }

    /* Called when a quiet/steady state is detected, to render expensive features such as edges */
    function quietCallback() {
        if (!that.appSnapshot.simulating) {
            debug('Quiet state');
            renderSlowEffects(that);
            that.appSnapshot.quietState = true;
            that.appSnapshot.vboUpdated = false;
        }
    }
};


module.exports = {
    setupBackgroundColor: setupBackgroundColor,
    setupCameraInteractions: setupCameraInteractions,
    setupLabelsAndCursor: setupLabelsAndCursor,
    setupRenderUpdates: setupRenderUpdates,
    RenderingScheduler: RenderingScheduler
};

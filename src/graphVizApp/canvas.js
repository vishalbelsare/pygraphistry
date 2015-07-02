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
var numeric = require('numeric');

//var math = require('mathjs');


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

    function ExpandedEdge(edgeIndex) {
        var midEdgeIdx = 0;
        var midPoint1X = curMidPoints[(edgeIndex * 2 * (numSplits)) + (midEdgeIdx * 2)];
        var midPoint1Y = curMidPoints[(edgeIndex *  2 * (numSplits)) + (midEdgeIdx * 2) + 1];

        this.srcPointIdx = logicalEdges[edgeIndex * 2];
        this.dstPointIdx = logicalEdges[(edgeIndex * 2) + 1];

        var srcPointX = curPoints[(2 * this.srcPointIdx)];
        var srcPointY = curPoints[(2 * this.srcPointIdx)+ 1];
        this.srcPoint = [srcPointX, srcPointY];
        var dstPointX = curPoints[(2 * this.dstPointIdx)];
        var dstPointY = curPoints[(2 * this.dstPointIdx) + 1];
        this.dstPoint = [dstPointX, dstPointY];
        this.midPoint = [midPoint1X, midPoint1Y];

        this.edgeVector = numeric.sub(this.dstPoint, this.srcPoint);
        var xDir = Math.pow(this.edgeVector[0], 2);
        var yDir = Math.pow(this.edgeVector[1], 2);
        this.length = Math.pow(xDir + yDir, 0.5);
        this.direction = [this.edgeVector[0] / this.length, this.edgeVector[1]/ this.length];

        this.theta = Math.atan2(this.edgeVector[1], this.edgeVector[0]);


        this.transformationMatrix = [
            [Math.cos(this.theta), Math.sin(this.theta)],
            [-Math.sin(this.theta), Math.cos(this.theta)]
        ];

        this.transformationMatrixInv = numeric.transpose(this.transformationMatrix);

        return this;

    }

    ExpandedEdge.prototype.toEdgeBasis = function(vector) {
        var test = numeric.sub(vector, this.srcPoint);
        var matrix = numeric.dot(this.transformationMatrix, test);
        return matrix.valueOf();
    };

    ExpandedEdge.prototype.fromEdgeBasis = function(vector) {
        //return math.multiply(this.transformationMatrixInv, vector).valueOf();
        return numeric.dot(this.transformationMatrixInv, vector);
    };

    ExpandedEdge.prototype.getCurveParameters = function() {
        var srcPoint,
            dstPoint,
            midPoint,
            yVector,
            xMatrix;

        srcPoint = [0, 0];
        dstPoint = this.toEdgeBasis(this.dstPoint);
        midPoint = this.toEdgeBasis(this.midPoint);
        yVector = [0, midPoint[1], dstPoint[1]];

        xMatrix = [
                this.getQuadratic(0),
                this.getQuadratic(midPoint[0]),
                this.getQuadratic(dstPoint[0])
        ];
        var epsilonMatrix = numeric.mul(numeric.identity(3), 0.0000000001);
        var xMatrix2 = numeric.add(xMatrix, epsilonMatrix);
        return numeric.dot(numeric.inv(xMatrix2), yVector);
    };

    ExpandedEdge.prototype.getQuadratic = function(x) {
        return [Math.pow(x, 2), x, 1];
    };

    ExpandedEdge.prototype.computePolynomial = function(x, betaVector) {
        var xVector = this.getQuadratic(x);
        return numeric.dot(betaVector, xVector);
    };

    ExpandedEdge.prototype.getMidPointPosition = function(betaVector, lambda) {
        var x,
            y,
            result,
            transformedVector;
        x = lambda * this.length;

        y = this.computePolynomial(x, betaVector);
        transformedVector = this.fromEdgeBasis([x, y]);

        result = numeric.add(this.srcPoint, transformedVector);

        return result;

    };

    function setMidEdge(edgeIdx, midEdgeIdx, srcPoint, dstPoint) {
        var elementsPerPoint = 2;
        var pointsPerEdge = 2;
        var midEdgesPerEdge = numRenderedSplits + 1;
        var midEdgeStride = elementsPerPoint * pointsPerEdge * midEdgesPerEdge;
        var midEdgeStartIdx = edgeIndex * midEdgeStride;
        midSpringsPos[midEdgeStartIdx + (midEdgeIdx * 4)] = srcPoint[0];
        midSpringsPos[midEdgeStartIdx + (midEdgeIdx * 4) + 1] = srcPoint[1];
        midSpringsPos[midEdgeStartIdx + (midEdgeIdx * 4) + 2] = dstPoint[0];
        midSpringsPos[midEdgeStartIdx + (midEdgeIdx * 4) + 3] = dstPoint[1];
    }

    for (var edgeIndex = 0; edgeIndex < numEdges; edgeIndex += 1) {
        var edge = new ExpandedEdge(edgeIndex);
        var curveParameters = edge.getCurveParameters();
        var srcPoint = edge.getMidPointPosition(curveParameters, 0);
        for (var midEdgeIdx = 0; midEdgeIdx < (numRenderedSplits + 1); midEdgeIdx++) {
            var lambda = (midEdgeIdx + 1) / (numRenderedSplits + 1);
            var dstPoint = edge.getMidPointPosition(curveParameters, lambda);
            setMidEdge(edgeIndex, midEdgeIdx, srcPoint, dstPoint);
            srcPoint = dstPoint;
        }
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
    //var springsPos;


    if (logicalEdges && appSnapshot.vboUpdated) {
        var start = Date.now();
        //if (appSnapshot.buffers.springsPos) {
            //springsPos = expandLogicalEdges(appSnapshot.buffers);
        //}
        var midSpringsPos = getPolynomialCurves(appSnapshot.buffers);
        renderer.loadBuffers(renderState, {'midSpringsPosClient': midSpringsPos});
        var end1 = Date.now();
        //renderer.loadBuffers(renderState, {'springsPosClient': springsPos});
        var end2 = Date.now();
        console.info('Edges expanded in', end1 - start, '[ms], and loaded in', end2 - end1, '[ms]');

        if (appSnapshot.buffers.arrowStartPos) {
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

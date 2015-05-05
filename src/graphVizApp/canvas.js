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

    labels.setupCursor(appState.renderState, appState.renderingScheduler, appState.isAnimating, latestHighlightedObject);
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

    for (var i = 0; i < numEdges; i++) {
        var start = [springsPos[4*i + 0], springsPos[4*i + 1]];
        var end   = [springsPos[4*i + 2], springsPos[4*i + 3]];

        arrowStartPos[6*i + 0] = start[0];
        arrowStartPos[6*i + 1] = start[1];
        arrowStartPos[6*i + 2] = start[0];
        arrowStartPos[6*i + 3] = start[1];
        arrowStartPos[6*i + 4] = start[0];
        arrowStartPos[6*i + 5] = start[1];

        arrowEndPos[6*i + 0] = end[0];
        arrowEndPos[6*i + 1] = end[1];
        arrowEndPos[6*i + 2] = end[0];
        arrowEndPos[6*i + 3] = end[1];
        arrowEndPos[6*i + 4] = end[0];
        arrowEndPos[6*i + 5] = end[1];

        arrowNormalDir[3*i + 0] = 0;  // Tip vertex
        arrowNormalDir[3*i + 1] = 1;  // Left vertex
        arrowNormalDir[3*i + 2] = -1; // Right vertex

        var pointSize = pointSizes[logicalEdges[2*i + 1]];
        arrowPointSizes[3*i + 0] = pointSize;
        arrowPointSizes[3*i + 1] = pointSize;
        arrowPointSizes[3*i + 2] = pointSize;

        arrowColors[3*i + 0] = edgeColors[2*i + 1];
        arrowColors[3*i + 1] = edgeColors[2*i + 1];
        arrowColors[3*i + 2] = edgeColors[2*i + 1];
    }
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

    if (logicalEdges && appSnapshot.vboUpdated) {
        var start = Date.now();
        var springsPos = expandLogicalEdges(appSnapshot.buffers);
        var end1 = Date.now();
        renderer.loadBuffers(renderState, {'springsPosClient': springsPos});
        var end2 = Date.now();
        console.info('Edges expanded in', end1 - start, '[ms], and loaded in', end2 - end1, '[ms]');

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
    var logicalEdges = new Uint32Array(buffers.logicalEdges.buffer);
    var hostBuffers = renderState.get('hostBuffersCache');
    var numElements = renderState.get('numElements');

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

    // TODO: Start with a small buffer and increase if necessary, masking underlying
    // data so we don't have to clear out later values. This way we won't have to constantly allocate
    buffers.highlightedEdges = new Float32Array(edgeIndices.length * 4);
    buffers.highlightedNodePositions = new Float32Array(nodeIndices.length * 2);
    buffers.highlightedNodeSizes = new Uint8Array(nodeIndices.length);

    numElements.edgehighlight = edgeIndices.length * 2;
    numElements.pointhighlight = nodeIndices.length;

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

    renderer.setupFullscreenBuffer(renderState);
    renderer.loadBuffers(renderState, {
        'highlightedEdgesPos': buffers.highlightedEdges,
        'highlightedPointsPos': buffers.highlightedNodePositions,
        'highlightedPointsSizes': buffers.highlightedNodeSizes
    });
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
            pointSizes: undefined,
            logicalEdges: undefined,
            springsPos: undefined,
            highlightedEdges: undefined,
            highlightedNodePositions: undefined,
            highlightedNodeSizes: undefined,
            edgeColors: undefined,
            arrowStartPos: undefined,
            arrowEndPos: undefined,
            arrowNormalDir: undefined,
            arrowColors: undefined,
            arrowPointSizes: undefined
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
        var bufUpdates = ['curPoints', 'logicalEdges', 'edgeColors', 'pointSizes'].map(function (bufName) {
            var bufUpdate = hostBuffers[bufName] || Rx.Observable.return();
            return bufUpdate.do(function (data) {
                that.appSnapshot.buffers[bufName] = data;
            });
        });
        return bufUpdates[0]
            .combineLatest(bufUpdates[1], bufUpdates[2], bufUpdates[3], _.identity);
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

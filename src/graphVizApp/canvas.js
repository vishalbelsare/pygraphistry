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

    labels.setupCursor(appState.renderState, appState.isAnimating, latestHighlightedObject);
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
    var numEdges = springsPos.length / 4; // Two coords (x,y) for each of the two end points.

    if (!bufferSnapshots.arrowPos) {
        bufferSnapshots.arrowPos = new Float32Array(numEdges * 2 * 3);
    }
    var arrowPos = bufferSnapshots.arrowPos;

    if (!bufferSnapshots.arrowColors) {
        bufferSnapshots.arrowColors = new Uint32Array(numEdges * 3);
    }
    var arrowColors = bufferSnapshots.arrowColors;

    if (!bufferSnapshots.arrowPointSizes) {
        bufferSnapshots.arrowPointSizes = new Uint8Array(numEdges * 3);
    }
    var arrowPointSizes = bufferSnapshots.arrowPointSizes;

    if (!bufferSnapshots.arrowEdgeVecs) {
        bufferSnapshots.arrowEdgeVecs = new Float32Array(numEdges * 2 * 3);
    }
    var arrowEdgeVecs = bufferSnapshots.arrowEdgeVecs;

    var arrowHeight = 2;
    var arrowHalfLength = arrowHeight / Math.sqrt(3);

    for (var i = 0; i < numEdges; i++) {
        var start = [springsPos[4*i + 0], springsPos[4*i + 1]];
        var end   = [springsPos[4*i + 2], springsPos[4*i + 3]];
        var pointSize = pointSizes[logicalEdges[2*i + 1]];
        console.log(pointSize);

        var vec = [start[0] - end[0], start[1] - end[1]];
        var norm = Math.sqrt(vec[0] * vec[0] + vec[1] * vec[1]);
        vec[0] = vec[0] / norm;
        vec[1] = vec[1] / norm;
        var nvec = [-vec[1], vec[0]];
        var startOffset = [0, 0];//[vec[0] * radius / 50, vec[1] * radius / 50];

        var base = [
            end[0] + startOffset[0] + vec[0] * arrowHeight,
            end[1] + startOffset[1] + vec[1] * arrowHeight
        ];
        var tip = [
            end[0] + startOffset[0],
            end[1] + startOffset[1]
        ];
        var wing1 = [
            base[0] + nvec[0] * arrowHalfLength,
            base[1] + nvec[1] * arrowHalfLength
        ];
        var wing2 = [
            base[0] - nvec[0] * arrowHalfLength,
            base[1] - nvec[1] * arrowHalfLength
        ];

        arrowPos[6*i + 0] = tip[0];
        arrowPos[6*i + 1] = tip[1];
        arrowPos[6*i + 2] = wing1[0];
        arrowPos[6*i + 3] = wing1[1];
        arrowPos[6*i + 4] = wing2[0];
        arrowPos[6*i + 5] = wing2[1];

        arrowColors[3*i + 0] = edgeColors[2*i + 1];
        arrowColors[3*i + 1] = edgeColors[2*i + 1];
        arrowColors[3*i + 2] = edgeColors[2*i + 1];

        arrowEdgeVecs[6*i + 0] = vec[0];
        arrowEdgeVecs[6*i + 1] = vec[1];
        arrowEdgeVecs[6*i + 2] = vec[0];
        arrowEdgeVecs[6*i + 3] = vec[1];
        arrowEdgeVecs[6*i + 4] = vec[0];
        arrowEdgeVecs[6*i + 5] = vec[1];

        arrowPointSizes[3*i + 0] = pointSize;
        arrowPointSizes[3*i + 1] = pointSize;
        arrowPointSizes[3*i + 2] = pointSize;
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
        renderer.loadBuffers(renderState, {'arrowPosClient': appSnapshot.buffers.arrowPos});
        renderer.loadBuffers(renderState, {'arrowColors': appSnapshot.buffers.arrowColors});
        renderer.loadBuffers(renderState, {'arrowEdgeVec': appSnapshot.buffers.arrowEdgeVecs});
        renderer.loadBuffers(renderState, {'arrowPointSizes': appSnapshot.buffers.arrowPointSizes});
        renderer.setNumElements(renderState, 'arrowculled', appSnapshot.buffers.arrowPos.length / 2);
        var end4 = Date.now();
        console.info('Arrows generated in ', end3 - end2, '[ms], and loaded in', end4 - end3, '[ms]');

    }

    renderer.setCamera(renderState);
    renderer.render(renderState, 'fullscene', 'renderSceneFull');
    renderer.render(renderState, 'picking', 'picking', undefined, undefined, function () {
        renderingScheduler.appSnapshot.hitmapUpdates.onNext();
    });
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
        buffers: {
            curPoints: undefined,
            pointSizes: undefined,
            logicalEdges: undefined,
            springsPos: undefined,
            edgeColors: undefined,
            arrowPos: undefined,
            arrowColors: undefined,
            arrowPointSizes: undefined,
            arrowEdgeVecs: undefined
        },
        hitmapUpdates: hitmapUpdates
    };

    Object.seal(this.appSnapshot);
    Object.seal(this.appSnapshot.buffers);


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
            callback: task.callback
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

            if (_.keys(renderQueue).length === 0) { // Nothing to render
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

            lastRenderTime = Date.now();
            if (quietSignaled) {
                isAnimating.onNext(true);
                quietSignaled = false;
            }

            renderer.setCamera(renderState);
            _.each(renderQueue, function (renderTask, tag) {
                renderer.render(renderState, tag, renderTask.trigger, renderTask.items,
                                renderTask.readPixels, renderTask.callback);
            });
            renderQueue = {};
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

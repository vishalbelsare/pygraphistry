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


function setupRenderUpdates(renderState, cameraStream, settingsChanges) {
    var renderUpdates = cameraStream.combineLatest(settingsChanges, _.identity);

    renderUpdates.do(function (camera) {
        //TODO: Make camera functional and pass camera to setCamera
        renderer.setCamera(renderState);
        renderScene('panzoom', 'renderSceneFast');
    }).subscribe(_.identity, util.makeErrorHandler('render updates'));
}


//TODO FIXME
function setupBackgroundColor() {
    /*TODO refactor this is out of place
    var stateWithColor =
        bgColor.map(function (rgb) {

            var currentState = renderState;

            var color = [[rgb.r/256, rgb.g/256, rgb.b/256,
                rgb.a === undefined ? 1 : rgb.a/256]];

            var config = currentState.get('config');
            var options = config.get('options');

            return currentState.set('config',
                                    config.set('options',
                                                options.set('clearColor', color)));
        });
    */
}


var renderingPaused = true;
var renderQueue = {};
var renderTasks = new Rx.Subject();


function renderScene(tag, trigger, items, readPixels, callback) {
    renderTasks.onNext({
        tag: tag,
        trigger: trigger,
        items: items,
        readPixels: readPixels,
        callback: callback
    });
}


function renderSlowEffects(renderState, vboUpdated, bufferSnapshots) {
    if (vboUpdated && renderState.get('config').get('edgeMode') === 'INDEXEDCLIENT') {
        var start = Date.now();

        var logicalEdges = new Uint32Array(bufferSnapshots.logicalEdges.buffer);
        var curPoints = new Float32Array(bufferSnapshots.curPoints.buffer);
        var numPoints = logicalEdges.length;

        if (!bufferSnapshots.springsPos) {
            bufferSnapshots.springsPos = new Float32Array(numPoints * 2);
        }
        var springsPos = bufferSnapshots.springsPos;

        for (var i = 0; i < numPoints; i++) {
            springsPos[2*i] = curPoints[2 * logicalEdges[i]];
            springsPos[2*i + 1] = curPoints[2 * logicalEdges[i] + 1];
        }

        var end1 = Date.now();
        renderer.loadBuffers(renderState, {'springsPosClient': springsPos});
        var end2 = Date.now();

        console.info('Edges expanded in', end1 - start, '[ms], and loaded in', end2 - end1, '[ms]');
    }

    renderer.render(renderState, 'fullscene', 'renderSceneFull');
    renderer.render(renderState, 'picking', 'picking');
}



function setupRenderingLoop(renderState, vboUpdates, isAnimating, simulateOn) {
    var vboUpdated = false;
    var simulating;
    var bufferSnapshots = {
        curPoints: undefined,
        logicalEdges: undefined,
        springsPos: undefined
    };

    simulateOn.subscribe(function (val) {
        simulating = val;
    }, util.makeErrorHandler('simulate updates'));


    var hostBuffers = renderState.get('hostBuffers');
    _.each(['curPoints', 'logicalEdges'], function (bufName) {
        var rxBuf = hostBuffers[bufName];
        if (rxBuf) {
            rxBuf.subscribe(function (data) {
                bufferSnapshots[bufName] = data;
            });
        }
    });

    vboUpdates.filter(function (status) {
        return status === 'received';
    }).do(function () {
        vboUpdated = true;
        renderScene('vboupdate', 'renderSceneFast');
        renderScene('vboupdate_picking', undefined, ['pointsampling']);
    }).subscribe(_.identity, util.makeErrorHandler('render vbo updates'));

    function quietCallback() {
        if (!simulating) {
            debug('Quiet state');
            renderSlowEffects(renderState, vboUpdated, bufferSnapshots);
            vboUpdated = false;
        }
    }

    renderTasks.subscribe(function (task) {
        debug('Queueing frame on behalf of', task.tag);
        renderQueue[task.tag] = task;

        if (renderingPaused) {
            startRenderingLoop(renderState, quietCallback, isAnimating);
        }
    });
}


function startRenderingLoop(renderState, quietCallback, isAnimating) {
    var lastRenderTime = 0;
    var quietSignaled = true;

    function loop() {
        var nextFrameId = window.requestAnimationFrame(loop);

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

        lastRenderTime = Date.now();
        if (quietSignaled) {
            isAnimating.onNext(true);
            quietSignaled = false;
        }

        _.each(renderQueue, function (renderTask, tag) {
            renderer.render(renderState, tag, renderTask.trigger, renderTask.items,
                            renderTask.readPixels, renderTask.callback);
        });
        renderQueue = {};
    }

    function pauseRenderingLoop(nextFrameId) {
        debug('Pausing rendering loop');
        window.cancelAnimationFrame(nextFrameId);
        renderingPaused = true;
    }

    debug('Starting rendering loop');
    renderingPaused = false;
    loop();
}


module.exports = {
    setupBackgroundColor: setupBackgroundColor,
    setupCameraInteractions: setupCameraInteractions,
    setupLabelsAndCursor: setupLabelsAndCursor,
    setupRenderUpdates: setupRenderUpdates,
    setupRenderingLoop: setupRenderingLoop
};

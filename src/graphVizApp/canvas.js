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


function setupLabelsAndCursor(appState, $eventTarget, $labelCont) {
    // Picks objects in priority based on order.
    var hitMapTextures = ['hitmap'];
    var latestHighlightedObject = labels.getLatestHighlightedObject(appState, $eventTarget, hitMapTextures);

    latestHighlightedObject.do(function (highlightIndices) {
        labels.renderCursor(appState.renderState, highlightIndices);
    }).subscribe(_.identity, util.makeErrorHandler('setupCursor'));

    $eventTarget.append($labelCont);
    labels.setupLabels(appState, $labelCont, latestHighlightedObject);
}


function setupRenderUpdates(renderState, cameraStream, settingsChanges) {
    var renderUpdates = cameraStream.combineLatest(
        settingsChanges,
        function (camera, nothing) { return camera; }
    )

    renderUpdates.do(function (camera) {
        //TODO: Make camera functional and pass camera to setCamera
        renderer.setCamera(renderState);
        renderScene('panzoom');
    }).subscribe(_.identity, util.makeErrorHandler('render updates'));
}


function setupBackgroundColor() {
    //TODO FIXME
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


function renderSlowEffects(state, currentlyQuiet) {
    renderer.render(state, 'picking', 'picking');
    $('.graph-label-container').css('display', 'block');
    currentlyQuiet.onNext();
}


function setupRenderingLoop(renderState, vboUpdates, currentlyQuiet) {
    vboUpdates.filter(function (status) {
        return status === 'received';
    }).do(function () {
        renderScene('vboupdate');
        renderScene('vboupdate_picking', 'picking');
    }).subscribe(_.identity, util.makeErrorHandler('render vbo updates'));

    function quietCallback() {
        console.log('Quiet state');
        renderSlowEffects(renderState, currentlyQuiet);
    }

    renderTasks.subscribe(function (task) {
        console.log('Queueing frame on behalf of', task.tag);
        renderQueue[task.tag] = task;

        if (renderingPaused) {
            startRenderingLoop(renderState, quietCallback);
        }
    });
}


function startRenderingLoop(renderState, quietCallback) {
    var lastRenderTime = 0;
    var quietSignaled = false;

    function loop() {
        var nextFrameId = window.requestAnimationFrame(loop);

        if (_.keys(renderQueue).length === 0) {
            var timeDelta = Date.now() - lastRenderTime;
            if (timeDelta > 200 && !quietSignaled) {
                quietSignaled = true;
                quietCallback();
            }

            if (timeDelta > 1000) {
                pauseRenderingLoop(nextFrameId);
            }
            return;
        }

        lastRenderTime = Date.now();
        quietSignaled = false;

        _.each(renderQueue, function (renderTask, tag) {
            renderer.render(renderState, tag, renderTask.trigger, renderTask.items,
                            renderTask.readPixels, renderTask.callback);
        });
        renderQueue = {};
    }

    function pauseRenderingLoop(nextFrameId) {
        console.log('Pausing rendering loop');
        window.cancelAnimationFrame(nextFrameId);
        renderingPaused = true;
    }

    console.log('Starting rendering loop');
    renderingPaused = false;
    loop();
}


module.exports = {
    setupCameraInteractions: setupCameraInteractions,
    setupLabelsAndCursor: setupLabelsAndCursor,
    setupRenderUpdates: setupRenderUpdates,
    setupRenderingLoop: setupRenderingLoop
};

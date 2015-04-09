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


var renderingPaused = true;
var renderQueue = {};
var latestState = new Rx.ReplaySubject(1);
var renderTasks = new Rx.Subject();


function renderScene(renderTasks, state, tag, trigger, items, readPixels, callback) {
    renderTasks.onNext({
        state: state,
        tag: tag,
        trigger: trigger,
        items: items,
        readPixels: readPixels,
        callback: callback
    });
}


function setupInteractions($eventTarget, renderState, bgColor, appState) {
    var stateStream = new Rx.Subject();
    stateStream.subscribe(latestState, util.makeErrorHandler('bad stateStream'));
    stateStream.onNext(renderState);

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
    interactions = Rx.Observable.merge(
        interactions,
        interaction.setupCenter($('#center'),
                                renderState.get('hostBuffers').curPoints,
                                camera),
        interaction.setupZoomButton($('#zoomin'), camera, 1 / 1.25)
            .flatMapLatest(util.observableFilter(appState.anyMarqueeOn, util.notIdentity)),
        interaction.setupZoomButton($('#zoomout'), camera, 1.25)
            .flatMapLatest(util.observableFilter(appState.anyMarqueeOn, util.notIdentity))
    );

    // Picks objects in priority based on order.
    var hitMapTextures = ['hitmap'];
    var latestHighlightedObject = labels.getLatestHighlightedObject($eventTarget, renderState,
                                                                    hitMapTextures, appState);

    latestHighlightedObject.combineLatest(
        latestState,
        function (h, s) { return {state: s, highlightIndices: h}; }
    ).do (function (now) {
        console.log('updating cursor');
        labels.renderCursor(now.state, now.highlightIndices);
    }).subscribe(_.identity, util.makeErrorHandler('renderCursor setup'));

    var $labelCont = $('<div>').addClass('graph-label-container');
    $eventTarget.append($labelCont);
    labels.setupLabels($labelCont, latestState, latestHighlightedObject, appState);


    //TODO refactor this is out of place
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

    //render scene on pan/zoom (get latest points etc. at that time)
    //tag render changes & label changes
    var renderStateUpdates = interactions
        .flatMapLatest(function (camera) {
            return Rx.Observable.combineLatest(
                stateWithColor,
                appState.settingsChanges,
                function (renderState, settingsChange) {
                    return {renderTag: Date.now(),
                            camera: camera,
                            settingsChange: settingsChange,
                            renderState: renderState};
                });
        }).do(function(data) {
            var currentState = renderer.setCameraIm(data.renderState, data.camera);
            stateStream.onNext(currentState);
            renderScene(renderTasks, currentState, 'panzoom');
        })
        .pluck('renderState');

    return renderStateUpdates;
}

function renderSlowEffects(state, currentlyQuiet) {
    renderer.render(state, 'picking', 'picking');
    $('.graph-label-container').css('display', 'block');
    currentlyQuiet.onNext();
}

function setupRendering(renderState, vboUpdates, appState) {

    vboUpdates.filter(function (status) {
        return status === 'received';
    }).do(function () {
        renderScene(renderTasks, renderState, 'vboupdate');
    }).subscribe(_.identity, util.makeErrorHandler('render vbo updates'));

    function quietCallback() {
        console.log('Quiet state');
        renderSlowEffects(renderState, appState.currentlyQuiet);
    }

    renderTasks.subscribe(function (task) {
        console.log('Queueing frame on behalf of', task.tag);
        renderQueue[task.tag] = task;

        latestState.onNext(task.state);

        if (renderingPaused) {
            startRenderingLoop(quietCallback);
        }
    });
}


function startRenderingLoop(quietCallback) {
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
            renderer.render(renderTask.state, tag, renderTask.trigger, renderTask.items,
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
    setupInteractions: setupInteractions,
    setupRendering: setupRendering
};

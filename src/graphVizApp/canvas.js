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


var DEBOUNCE_TIME = 60;


function renderScene(lastRender, renderer, currentState, data) {
    lastRender.onNext({renderer: renderer, currentState: currentState, data: data});
}


function setupDragHoverInteractions($eventTarget, renderState, bgColor, appState) {
    //var currentState = renderState;
    var stateStream = new Rx.Subject();
    var latestState = new Rx.ReplaySubject(1);
    stateStream.subscribe(latestState, util.makeErrorHandler('bad stateStream'));
    stateStream.onNext(renderState);

    var camera = renderState.get('camera');
    var canvas = renderState.get('canvas');

    var $marquee = $('#marqueerectangle i.fa');

    //pan/zoom
    //Observable Event
    var interactions;
    if(interaction.isTouchBased) {
        debug('Detected touch-based device. Setting up touch interaction event handlers.');
        var eventTarget = $eventTarget[0];
        interactions = interaction.setupSwipe(eventTarget, camera)
            .merge(
                interaction.setupPinch($eventTarget, camera)
                .filter(function () { return !$marquee.hasClass('toggle-on'); }));
    } else {
        debug('Detected mouse-based device. Setting up mouse interaction event handlers.');
        interactions = interaction.setupDrag($eventTarget, camera)
            .merge(interaction.setupScroll($eventTarget, canvas, camera));

    }
    interactions = Rx.Observable.merge(
        interactions,
        interaction.setupCenter($('#center'),
                                renderState.get('hostBuffers').curPoints,
                                camera),
        interaction.setupZoomButton($('#zoomin'), camera, 1 / 1.25)
            .filter(function () { return !$marquee.hasClass('toggle-on'); }),
        interaction.setupZoomButton($('#zoomout'), camera, 1.25)
            .filter(function () { return !$marquee.hasClass('toggle-on'); })
    );

    // Picks objects in priority based on order.
    var hitMapTextures = ['hitmap'];
    var latestHighlightedObject = labels.getLatestHighlightedObject($eventTarget, renderState, hitMapTextures, appState);

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
                renderState.get('hostBuffers').curPoints,
                renderState.get('hostBuffers').pointSizes,
                stateWithColor,
                appState.settingsChanges,
                function (curPoints, pointSizes, renderState, settingsChange) {
                    return {renderTag: Date.now(),
                            camera: camera,
                            curPoints: curPoints,
                            pointSizes: pointSizes,
                            settingsChange: settingsChange,
                            renderState: renderState};
                });
        })
        .flatMapLatest(function (data) {
            // TODO: pass in dim. Handle Dim.
            // Temporary hack -- ignore edges.
            return latestHighlightedObject.map(function (highlightIndices) {
                return _.extend({labelTag: Date.now(), highlightIndices: highlightIndices}, data);
            });
        })
        .do(function(data) {
            var currentState = renderer.setCameraIm(data.renderState, data.camera);
            stateStream.onNext(currentState);
            renderScene(appState.lastRender, renderer, currentState, data);
        })
        .pluck('renderState');

    return renderStateUpdates;
}


function setupRendering(appState) {

    // Determine if it's a quiet/noisy state
    var startRendering = appState.lastRender
        .scan({prev: null, cur: null}, function (acc, v) { return {prev: acc.cur, cur: v}; })
        .filter(function (pair) {
            return (!pair.prev || (pair.cur.data.renderTag !== pair.prev.data.renderTag));
        })
        .sample(DEBOUNCE_TIME);

    var stopRendering = appState.lastRender
        .scan({prev: null, cur: null}, function (acc, v) { return {prev: acc.cur, cur: v}; })
        .filter(function (pair) {
            return (!pair.prev || (pair.cur.data.renderTag !== pair.prev.data.renderTag));
        })
        .debounce(DEBOUNCE_TIME);

    // What to do when starting noisy/rendering state
    // TODO: Show/hide with something cleaner than pure JQuery. At least a function.
    startRendering
        .do(function () {
            $('.graph-label-container').css('display', 'none');
        })
        .do(function () {
            appState.currentlyRendering.onNext(true);
        })
        .subscribe(_.identity, util.makeErrorHandler('Start Rendering'));

    // What to do when exiting noisy/rendering state
    stopRendering
        .flatMap(function (pair) {
            return appState.simulateOn.map(function (val) {
                return _.extend(pair, {simulateOn: val});
            });
        })
        .filter(function (pair) {
            return !pair.simulateOn;
        })
        .do(function (pair) {
            pair.cur.renderer.render(pair.cur.currentState, 'interactionPicking', null,
                {renderListOverride: ['pointpicking', 'edgepicking', 'pointsampling']});
        })
        .do(function () {
            $('.graph-label-container').css('display', 'block');
        })
        .do(function () {
            appState.currentlyRendering.onNext(false);
        })
        .subscribe(_.identity, util.makeErrorHandler('Stop Rendering'));

    //Render gpu items, text on reqAnimFrame
    //Slower, update the pointpicking sampler (does GPU->CPU transfer)
    appState.lastRender
        .bufferWithTime(10)
        .filter(function (arr) { return arr.length; })
        .map(function (arr) {
            var res = arr[arr.length - 1];
            _.extend(res.data,
                arr.reduce(
                    function (acc, v) {
                        return {
                            data: {
                                renderTag: Math.max(v.data.renderTag, acc.data.renderTag),
                                labelTag: Math.max(v.data.labelTag, acc.data.labelTag)
                            }
                        };
                    },
                    {data: { renderTag: 0, labelTag: 0}}));
            return res;
        })
        .scan({prev: null, cur: null}, function (acc, v) { return {prev: acc.cur, cur: v}; })
        .do(function (pair) {
            var cfg = pair.cur;
            if (!pair.prev || (cfg.data.renderTag !== pair.prev.data.renderTag)) {
                cfg.renderer.render(cfg.currentState, 'interactionRender');
            }

            labels.renderCursor(cfg.currentState, new Float32Array(cfg.data.curPoints.buffer),
                         cfg.data.highlightIndices, new Uint8Array(cfg.data.pointSizes.buffer));
        })
        .pluck('cur')
        .scan({prev: null, cur: null}, function (acc, v) { return {prev: acc.cur, cur: v}; })
        .bufferWithTime(80)
        .filter(function (arr) { return arr.length; })
        .map(function (arr) {
            var res = arr[arr.length - 1];
            _.extend(res.data,
                arr.reduce(
                    function (acc, v) {
                        return {
                            renderTag: Math.max(v.renderTag, acc.renderTag),
                            labelTag: Math.max(v.labelTag, acc.labelTag)
                        };
                    },
                    {data: { renderTag: 0, labelTag: 0}}));
            return res;
        })
        .subscribe(_.identity, util.makeErrorHandler('render effect'));
}


module.exports = {
    setupDragHoverInteractions: setupDragHoverInteractions,
    setupRendering: setupRendering
};

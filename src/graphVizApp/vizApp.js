'use strict';

// FIXME: Move this to graph-viz repo -- it shouldn't be a part of the core StreamGL library

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:vizApp');
var $       = window.$;
var _       = require('underscore');
var Rx      = require('rx');
              require('../rx-jquery-stub');

var shortestpaths   = require('./shortestpaths.js');
var colorpicker     = require('./colorpicker.js');
var controls        = require('./controls.js');
var canvas          = require('./canvas.js');
var ui              = require('../ui.js');
var poiLib          = require('../poi.js');
var util            = require('./util.js');


// ... -> Observable renderState
function init(socket, $elt, initialRenderState, vboUpdates, workerParams, urlParams) {
    debug('Initializing vizApp.');

    //////////////////////////////////////////////////////////////////////////
    // App State
    //////////////////////////////////////////////////////////////////////////
    var poi = poiLib(socket);
    // Observable DOM
    var labelHover = new Rx.Subject();

    var currentlyQuiet = new Rx.ReplaySubject(1);
    var cameraChanges = new Rx.ReplaySubject(1);

    var settingsChanges = new Rx.ReplaySubject(1);
    settingsChanges.onNext({});

    // Marquee button selected
    var marqueeOn = new Rx.ReplaySubject(1);
    marqueeOn.onNext(false);
    // Marquee being drawn / dragged
    var marqueeActive = new Rx.ReplaySubject(1);
    marqueeActive.onNext(false);
    // Marquee finished drawing on the canvas
    // TODO: Do we really need this?
    var marqueeDone = new Rx.ReplaySubject(1);
    marqueeDone.onNext(false);
    // Simulate button selected
    var simulateOn = new Rx.ReplaySubject(1);
    simulateOn.onNext(false);
    // Brush button selected
    var brushOn = new Rx.ReplaySubject(1);
    brushOn.onNext(false);
    // Is any marquee type toggled on?
    var anyMarqueeOn = marqueeOn
        .flatMap(function (marqueeVal) {
            return brushOn
                .map(function (brushVal) {
                    return (brushVal || marqueeVal);
                });
        });

    var appState = {
        renderState: initialRenderState,
        vboUpdates: vboUpdates,
        cameraChanges: cameraChanges,
        labelHover: labelHover,
        currentlyQuiet: currentlyQuiet,
        poi: poi,
        settingsChanges: settingsChanges,
        marqueeOn: marqueeOn,
        marqueeActive: marqueeActive,
        marqueeDone: marqueeDone,
        simulateOn: simulateOn,
        brushOn: brushOn,
        anyMarqueeOn: anyMarqueeOn
    };


    //////////////////////////////////////////////////////////////////////////
    // Setup
    //////////////////////////////////////////////////////////////////////////

    canvas.setupRenderingLoop(appState.renderState, appState.vboUpdates, appState.currentlyQuiet);
    canvas.setupCameraInteractions(appState, $elt)
        .subscribe(appState.cameraChanges, util.makeErrorHandler('cameraChanges'));

    var $labelCont = $('<div>').addClass('graph-label-container');
    canvas.setupLabelsAndCursor(appState, $elt, $labelCont);
    canvas.setupRenderUpdates(appState.renderState, cameraChanges, settingsChanges);


    //var colors = colorpicker($('#foregroundColor'), $('#backgroundColor'), socket);
    //var renderStateUpdates = canvas.setupInteractions($elt, colors.backgroundColor, appState);
    //shortestpaths($('#shortestpath'), poi, socket);

    var doneLoading = vboUpdates.filter(function (update) {
        return update === 'received';
    }).take(1).do(ui.hideSpinnerShowBody).delay(700);

    doneLoading.subscribe(_.identity, util.makeErrorHandler('doneLoading'));


    controls.init(socket, $elt, initialRenderState, doneLoading, workerParams, urlParams, appState);

    return null;//renderStateUpdates;
}


module.exports = init;

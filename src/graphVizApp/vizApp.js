'use strict';

// FIXME: Move this to graph-viz repo -- it shouldn't be a part of the core StreamGL library

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:vizApp');
var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');

var shortestpaths   = require('./shortestpaths.js');
var colorpicker     = require('./colorpicker.js');
var controls        = require('./controls.js');
var filterer        = require('./filter.js');
var canvas          = require('./canvas.js');
var ui              = require('../ui.js');
var poiLib          = require('../poi.js');
var util            = require('./util.js');
var timeslider      = require('./timeslider.js');


function init(socket, initialRenderState, vboUpdates, workerParams, urlParams) {
    debug('Initializing vizApp.');

    //////////////////////////////////////////////////////////////////////////
    // App State
    //////////////////////////////////////////////////////////////////////////
    var poi = poiLib(socket);
    // Observable DOM
    var labelHover = new Rx.Subject();

    var cameraChanges = new Rx.ReplaySubject(1);
    cameraChanges.onNext(initialRenderState.get('camera'));
    var isAnimating = new Rx.ReplaySubject(1);
    isAnimating.onNext(false);

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

    var isAnimatingOrSimulating = isAnimating
        .flatMap(function (animating) {
            return simulateOn
                .map(function (simulating) {
                    return (animating || simulating);
                });
        });

    var appState = {
        renderState: initialRenderState,
        vboUpdates: vboUpdates,
        hitmapUpdates: new Rx.ReplaySubject(1),
        cameraChanges: cameraChanges,
        isAnimating: isAnimating,
        labelHover: labelHover,
        poi: poi,
        settingsChanges: settingsChanges,
        marqueeOn: marqueeOn,
        marqueeActive: marqueeActive,
        marqueeDone: marqueeDone,
        simulateOn: simulateOn,
        isAnimatingOrSimulating: isAnimatingOrSimulating,
        brushOn: brushOn,
        anyMarqueeOn: anyMarqueeOn
    };

    //////////////////////////////////////////////////////////////////////////
    // DOM Elements
    //////////////////////////////////////////////////////////////////////////

    var $simCont   = $('.sim-container');
    var $fgPicker  = $('#foregroundColor');
    var $bgPicker  = $('#backgroundColor');
    var $spButton  = $('#shortestpath');

    //////////////////////////////////////////////////////////////////////////
    // Setup
    //////////////////////////////////////////////////////////////////////////

    appState.renderingScheduler = new canvas.RenderingScheduler(appState.renderState,
                                                                appState.vboUpdates,
                                                                appState.hitmapUpdates,
                                                                appState.isAnimating,
                                                                appState.simulateOn);

    canvas.setupCameraInteractions(appState, $simCont).subscribe(
        appState.cameraChanges,
        util.makeErrorHandler('cameraChanges')
    );

    canvas.setupLabelsAndCursor(appState, urlParams, $simCont);
    canvas.setupRenderUpdates(appState.renderingScheduler, appState.cameraChanges, appState.settingsChanges);

    var colors = colorpicker.init($fgPicker, $bgPicker, socket, initialRenderState);
    canvas.setupBackgroundColor(appState.renderingScheduler, colors.backgroundColor);
    //TODO expose through cascade and provide to export
    if (urlParams['background-image']) {
        $simCont.css('background-image', 'url("' + urlParams['background-image'] + '")');
    }
    if (urlParams['mix-blend-mode']) {
        $('#simulation').css('mix-blend-mode', urlParams['mix-blend-mode']);
    }
    if (urlParams.opacity) {
        $('#simulation').css('opacity', urlParams.opacity);
    }

    shortestpaths($spButton, poi, socket);

    var doneLoading = vboUpdates.filter(function (update) {
        return update === 'received';
    }).take(1).do(ui.hideSpinnerShowBody).delay(700);

    timeslider.init(appState, socket, urlParams);

    controls.init(appState, socket, $simCont, doneLoading, workerParams, urlParams);
    filterer.init(appState, socket, urlParams, $('#filterButton'), $('#filteringItems'));

}


module.exports = init;

'use strict';

// FIXME: Move this to graph-viz repo -- it shouldn't be a part of the core StreamGL library

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:vizApp');
var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');

var shortestpaths   = require('./shortestpaths.js');
var colorpicker     = require('./colorpicker.js');
var controls        = require('./controls.js');
var canvas          = require('./canvas.js');
var ui              = require('../ui.js');
var poiLib          = require('../poi.js');


// ... -> Observable renderState
function init(socket, $elt, initialRenderState, vboUpdates, workerParams, urlParams) {
    debug('Initializing vizApp.');

    //////////////////////////////////////////////////////////////////////////
    // App State
    //////////////////////////////////////////////////////////////////////////
    var renderState = new Rx.ReplaySubject(1);
    renderState.onNext(initialRenderState);

    var poi = poiLib(socket);
    // Observable DOM
    var labelHover = new Rx.Subject();

    var currentlyQuiet = new Rx.ReplaySubject(1);

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

    canvas.setupRendering(initialRenderState, vboUpdates, appState);
    var colors = colorpicker($('#foregroundColor'), $('#backgroundColor'), socket);
    var renderStateUpdates = canvas.setupInteractions($elt, initialRenderState, colors.backgroundColor, appState);
    shortestpaths($('#shortestpath'), poi, socket);

    var doneLoading = vboUpdates.filter(function (update) {
        return update === 'received';
    }).take(1).do(ui.hideSpinnerShowBody).delay(700);

    controls.init(socket, $elt, initialRenderState, doneLoading, workerParams, urlParams, appState);

    return renderStateUpdates;
}


module.exports = init;

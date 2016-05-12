'use strict';

// FIXME: Move this to graph-viz repo -- it shouldn't be a part of the core StreamGL library

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:vizApp');
var $       = window.$;
var _       = require('underscore');
var Rx      = require('rxjs/Rx.KitchenSink');
              require('../rx-jquery-stub');

var shortestpaths   = require('./shortestpaths.js');
var colorPicker     = require('./colorpicker.js');
var controls        = require('./controls.js');
var canvas          = require('./canvas.js');
var labels          = require('./labels.js');
var ui              = require('../ui.js');
var poiLib          = require('../poi.js');
var util            = require('./util.js');
var highlight       = require('./highlight.js');
var api             = require('./api.js');
var VizSlice        = require('./VizSlice.js');
var Version         = require('./Version.js');


function init(socket, initialRenderState, vboUpdates, vboVersions, apiEvents, apiActions,
              workerParams, urlParams) {
    debug('Initializing vizApp', 'URL params', urlParams);

    //////////////////////////////////////////////////////////////////////////
    // App State
    //////////////////////////////////////////////////////////////////////////

    var labelRequests = new Rx.Subject();
    var poi = poiLib(socket, labelRequests);

    // Observable DOM
    var labelHover = new Rx.Subject();

    var cameraChanges = new Rx.ReplaySubject(1);
    cameraChanges.onNext(initialRenderState.get('camera'));
    var isAnimating = new Rx.ReplaySubject(1);
    isAnimating.onNext(false);

    var settingsChanges = new Rx.ReplaySubject(1);
    settingsChanges.onNext({});
    var activeSelection = new Rx.ReplaySubject(1);
    activeSelection.onNext(new VizSlice([]));

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

    var latestHighlightedObject = new Rx.ReplaySubject(1);

    var labelsAreEnabled = new Rx.ReplaySubject(1);
    labelsAreEnabled.onNext(urlParams.hasOwnProperty('labels') ? urlParams.labels : true);
    apiActions
        .filter(function (msg) { return msg && (msg.setting === 'labels'); })
        .do(function (msg) {
            labelsAreEnabled.onNext(msg.value);
        }).subscribe(_.identity, util.makeErrorHandler('Error updating label enabling'));

    var poiIsEnabled = new Rx.ReplaySubject(1);
    poiIsEnabled.onNext(urlParams.hasOwnProperty('poi') ? urlParams.poi : true);
    apiActions
        .filter(function (msg) { return msg && (msg.setting === 'poi'); })
        .do(function (msg) {
            poiIsEnabled.onNext(msg.value);
        }).subscribe(_.identity, util.makeErrorHandler('renderPipeline error'));

    var viewConfigChanges = new Rx.ReplaySubject(1);
    socket.emit('get_view_config', null, function (response) {
        if (response.success) {
            debug('Received view config from server', response.viewConfig);
            viewConfigChanges.onNext(response.viewConfig);
        } else {
            throw Error('Failed to get viewConfig');
        }
    });
    viewConfigChanges.do(function (viewConfig) {
        var parameters = viewConfig.parameters;
        if (parameters !== undefined) {
            if (parameters.poiEnabled !== undefined) {
                poiIsEnabled.onNext(parameters.poiEnabled);
            }
            if (parameters.labelsEnabled !== undefined) {
                labelsAreEnabled.onNext(parameters.labelsEnabled);
            }
        }
    });

    var appState = {
        renderState: initialRenderState,
        vboUpdates: vboUpdates,
        vboVersions: vboVersions,
        hitmapUpdates: new Rx.ReplaySubject(1),
        cameraChanges: cameraChanges,
        viewConfigChanges: viewConfigChanges,
        isAnimating: isAnimating,
        labelHover: labelHover,
        poi: poi,
        labelRequests: labelRequests,
        settingsChanges: settingsChanges,
        marqueeOn: marqueeOn,
        marqueeActive: marqueeActive,
        marqueeDone: marqueeDone,
        simulateOn: simulateOn,
        isAnimatingOrSimulating: isAnimatingOrSimulating,
        brushOn: brushOn,
        anyMarqueeOn: anyMarqueeOn,
        activeSelection: activeSelection,
        latestHighlightedObject: latestHighlightedObject,
        apiEvents: apiEvents,
        apiActions: apiActions,
        poiIsEnabled: poiIsEnabled,
        labelsAreEnabled: labelsAreEnabled,
        clickEvents: new Rx.ReplaySubject(0)
    };

    //////////////////////////////////////////////////////////////////////////
    // DOM Elements
    //////////////////////////////////////////////////////////////////////////

    var $simCont   = $('.sim-container');
    var $fgPicker  = $('#foregroundColor');
    var $bgPicker  = $('#backgroundColor');
    var $spButton  = $('#shortestpath');
    var $toolbar   = $('#controlState');

    //////////////////////////////////////////////////////////////////////////
    // Setup
    //////////////////////////////////////////////////////////////////////////

    appState.renderingScheduler = new canvas.RenderingScheduler(appState.renderState,
                                                                appState.vboUpdates,
                                                                appState.vboVersions,
                                                                appState.hitmapUpdates,
                                                                appState.isAnimating,
                                                                appState.simulateOn,
                                                                appState.activeSelection,
                                                                socket);

    canvas.setupCameraInteractions(appState, $simCont).subscribe(
        appState.cameraChanges,
        util.makeErrorHandler('cameraChanges')
    );

    labels.setupLabelsAndCursor(appState, socket, urlParams, $simCont);
    canvas.setupCameraInteractionRenderUpdates(appState.renderingScheduler, appState.cameraChanges,
            appState.settingsChanges, appState.simulateOn);

    highlight.setupHighlight(appState);

    var backgroundColorObservable = colorPicker.backgroundColorObservable(initialRenderState, urlParams);
    var foregroundColorObservable = colorPicker.foregroundColorObservable();
    colorPicker.init($fgPicker, $bgPicker, foregroundColorObservable, backgroundColorObservable, socket, initialRenderState);
    // TODO use colors.foregroundColor for the renderer/canvas!
    canvas.setupBackgroundColor(appState.renderingScheduler, backgroundColorObservable);
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
    }).take(1).do(ui.hideSpinnerShowBody).delay(100);

    controls.init(appState, socket, $toolbar, doneLoading, workerParams, urlParams);
    api.setupAPIHooks(socket, appState, doneLoading);

    Version(socket);
}


module.exports = init;

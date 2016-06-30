'use strict';

// FIXME: Move this to graph-viz repo -- it shouldn't be a part of the core StreamGL library

import Color from 'color';

const debug   = require('debug')('graphistry:StreamGL:graphVizApp:vizApp');
const $       = window.$;
const _       = require('underscore');
const Rx      = require('@graphistry/rxjs');
              require('../rx-jquery-stub');

const shortestPaths   = require('./shortestpaths.js');
const controls        = require('./controls.js');
const canvas          = require('./canvas.js');
const labels          = require('./labels.js');
const ui              = require('../ui.js');
const poiLib          = require('../poi.js');
const util            = require('./util.js');
const Highighter      = require('./highlight.js');
const api             = require('./api.js');
const Version         = require('./Version.js');
const VizSlice        = require('./VizSlice.js');


function init (socket, initialRenderState, vboUpdates, vboVersions, apiEvents, apiActions,
               workerParams, urlParams, rootModel, rootJSON) {

    debug('Initializing vizApp', 'URL params', urlParams);

    //////////////////////////////////////////////////////////////////////////
    // App State
    //////////////////////////////////////////////////////////////////////////

    const openWorkbook = rootJSON.workbooks.open;
    const { workbooks: { open: { views: {
        current: currentView,
        current: { scene: { hints: sceneHints }}
    }}}} = rootJSON;

    const hintsModel = rootModel.deref(sceneHints);
    const labelsModel = rootModel.deref(currentView.labels);
    const backgroundModel = rootModel.deref(currentView.background);
    const currentViewModel = rootModel.deref(currentView);

    const labelRequests = new Rx.Subject();
    const poi = poiLib(socket, labelRequests);

    // Observable DOM
    const labelHover = new Rx.Subject();

    const cameraChanges = new Rx.ReplaySubject(1);
    cameraChanges.onNext(initialRenderState.get('camera'));
    const isAnimating = new Rx.ReplaySubject(1);
    isAnimating.onNext(false);

    const activeSelection = new Rx.ReplaySubject(1);
    activeSelection.onNext(new VizSlice([]));

    // Marquee button selected
    const marqueeOn = new Rx.ReplaySubject(1);
    marqueeOn.onNext(false);
    // Marquee being drawn / dragged
    const marqueeActive = new Rx.ReplaySubject(1);
    marqueeActive.onNext(false);
    // Marquee finished drawing on the canvas
    // TODO: Do we really need this?
    const marqueeDone = new Rx.ReplaySubject(1);
    marqueeDone.onNext(false);
    // Simulate button selected
    const simulateOn = new Rx.ReplaySubject(1);
    simulateOn.onNext(false);
    // Brush button selected
    const brushOn = new Rx.ReplaySubject(1);
    brushOn.onNext(false);
    // Is any marquee type toggled on?
    const anyMarqueeOn = marqueeOn
        .flatMap((marqueeVal) => brushOn.map((brushVal) => brushVal || marqueeVal));

    const isAnimatingOrSimulating = isAnimating
        .flatMap((animating) => simulateOn.map((simulating) => animating || simulating));

    const latestHighlightedObject = new Rx.ReplaySubject(1);

    const viewConfigChanges = new Rx.ReplaySubject(1);

    viewConfigChanges.next(currentView);

    const appState = {
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
        clickEvents: new Rx.ReplaySubject(0)
    };

    //////////////////////////////////////////////////////////////////////////
    // DOM Elements
    //////////////////////////////////////////////////////////////////////////

    const $simCont   = $('.sim-container');
    const $spButton  = $('#shortestpath');
    const $toolbar   = $('#controlState');

    //////////////////////////////////////////////////////////////////////////
    // Setup
    //////////////////////////////////////////////////////////////////////////

    const renderingScheduler =
    appState.renderingScheduler = new canvas.RenderingScheduler(appState.renderState,
                                                                appState.vboUpdates,
                                                                appState.vboVersions,
                                                                appState.hitmapUpdates,
                                                                appState.isAnimating,
                                                                appState.simulateOn,
                                                                appState.activeSelection,
                                                                socket, hintsModel);

    canvas.setupCameraInteractions(appState, $simCont).subscribe(
        appState.cameraChanges,
        util.makeErrorHandler('cameraChanges')
    );

    labels.setupLabelsAndCursor(appState, socket, urlParams, $simCont, labelsModel);
    canvas.setupCameraInteractionRenderUpdates(
        appState.renderingScheduler,
        appState.cameraChanges,
        currentViewModel,
        appState.simulateOn
    );

    const highlighter = new Highighter(
        appState.latestHighlightedObject, appState.activeSelection, appState.renderingScheduler);
    highlighter.setupHighlight();

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

    shortestPaths($spButton, poi, socket);

    const doneLoading = vboUpdates
        .filter((update) => update === 'received')
        .take(1).do(ui.hideSpinnerShowBody).delay(100);

    controls.init(appState, socket, $toolbar, doneLoading, workerParams, urlParams);

    api.setupAPIHooks(socket, appState, doneLoading);

    Version(socket);

    backgroundModel.changes()
        .switchMap(
            (model) => model.get('color'),
            (model, { json }) => ({ model, json })
        )
        .map(({ json: { color }}) => [new Color(color).rgbaArray().map((x, i) =>
            i === 3 ? x : x / 255
        )])
        .subscribe((bgColors) => {
            renderingScheduler.renderState.get('options').clearColor = bgColors;
            renderingScheduler
                .renderScene('bgcolor', {trigger: 'renderSceneFast'});
        });
}


module.exports = init;

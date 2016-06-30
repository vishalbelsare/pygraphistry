'use strict';

const debug   = require('debug')('graphistry:StreamGL:graphVizApp:controls');
const $       = window.$;
const Rx      = require('@graphistry/rxjs');
                require('../rx-jquery-stub');
const _       = require('underscore');

const util            = require('./util.js');
const dataInspector   = require('./dataInspector.js');
const FiltersPanel    = require('./filtersPanel.js');
const ExclusionsPanel = require('./ExclusionsPanel.js');
const SetsPanel       = require('./setsPanel.js');
const HistogramBrush  = require('./histogramBrush.js');
const marqueeFact     = require('./marquee.js');
const runButton       = require('./runButton.js');
const forkVgraph      = require('./fork.js');
const persist         = require('./persist.js');
const goLiveButton    = require('./goLiveButton.js');
const externalLink    = require('./externalLink.js');
const fullscreenLink  = require('./fullscreenLink.js');
const TimeExplorer    = require('./timeExplorer/timeExplorer.js');
const contentFormatter = require('./contentFormatter.js');
const Command         = require('./command.js');
const VizSlice        = require('./VizSlice.js');

// TODO FIXME Why do we need this to click on a switchboard instead of jquery?
// Where this is used in the selection marquee handler, jquery functions don't seem to work.
function triggerRawMouseEvent (el, evt) {
    const mouseEvt = document.createEvent('MouseEvents');
    mouseEvt.initEvent(evt, true, true);
    el.dispatchEvent(mouseEvt);
}

function setupSelectionMarquee (appState, isOn) {
    const camera = appState.renderState.get('camera');
    const cnv = appState.renderState.get('canvas');
    const transform = (point) => camera.canvas2WorldCoords(point.x, point.y, cnv);

    const marquee = marqueeFact.createSelectionMarquee($('#marquee'));

    // TODO: Handle switchboard + tool activation saner
    isOn.filter(_.identity).do(() => {
        marquee.enable();
    }).subscribe(_.identity, util.makeErrorHandler('enable selection marquee'));

    isOn.filter((x) => !x).do(() => {
        marquee.disable();
    }).subscribe(_.identity, util.makeErrorHandler('enable selection marquee'));

    // Assumes world coordinates, and a dense point position Float32Array of [x1, y1, x2, y2, ...]
    const getPointIndicesInRectangularRegion = (points, tl, br) => {
        const matchedPoints = [];
        const numPoints = points.length / 2;
        for (let i = 0; i < numPoints; i++) {
            let x = points[i*2];
            let y = points[i*2 + 1];
            if (x > tl.x && y < tl.y && x < br.x && y > br.y) {
                matchedPoints.push(i);
            }
        }
        return matchedPoints;
    }

    // Handle selections
    marquee.selections.switchMap((marqueeState) => {
        // TODO: Provide smoother way to handle getting these
        return appState.renderState.get('hostBuffers').curPoints.take(1)
            .map((rawPoints) => {
                const points = new Float32Array(rawPoints.buffer);
                return {marqueeState, points};
            });
    }).map(({marqueeState, points}) => {

        // Case where there is no valid selection (e.g., user just clicked and didn't drag)
        if (!marqueeState.lastRect) {
            return [];
        }

        const {tl, br} = marqueeState.lastRect;
        const tlWorld = transform(tl);
        const brWorld = transform(br);

        return getPointIndicesInRectangularRegion(points, tlWorld, brWorld);
    }).do((selectedPoints) => {
        // TODO: Allow for union of new selection with old one (via modifier key?)
        const newSelection = new VizSlice({point: selectedPoints});
        appState.activeSelection.onNext(newSelection);
    }).do(() => {
        // Turn off selection tool. Done here by simulating raw mouse events on the
        // switchboard button. JQuery .mousedown() did not seem to get the same result.
        // TODO FIXME: Just update a falcor model.

        const button = $('#viewSelectionButton')[0];

        // We do staggered down -> up because the handlers can't respond to a click.
        triggerRawMouseEvent(button, 'mousedown');
        setTimeout(() => {
            triggerRawMouseEvent(button, 'mouseup');
        }, 10);
    }).subscribe(_.identity, util.makeErrorHandler('handling selections marquee'));

}

/**
 * @typedef {Object} Brush
 * @property selections
 * @property bounds
 * @property drags
 * @property doneDragging
 * @property $elt
 * @property isOn
 */


/**
 * @param appState
 * @param isOn
 * @returns {Brush}
 */
function setupBrush(appState, isOn) {
    const camera = appState.renderState.get('camera');
    const cnv = appState.renderState.get('canvas');
    const transform = (point) => camera.canvas2WorldCoords(point.x, point.y, cnv);

    const marquee = marqueeFact.createDraggableMarquee($('#brush'));

    // TODO: Handle switchboard + tool activation saner
    isOn.do((on) => {
        if (on) {
            marquee.enable();
        } else {
            marquee.disable();
        }
    }).subscribe(_.identity, util.makeErrorHandler('enable/disable brush marquee'));

    const marqueeStateToTransformedRect = (marqueeState) => {
        if (marqueeState.allSelected) {
            return {all: true};
        }

        const {tl, br} = marqueeState.lastRect;
        const tlWorld = transform(tl);
        const brWorld = transform(br);
        return {tl: tlWorld, br: brWorld};
    };

    // Initialize both with an {all: true} selection
    const transformedSelections = marquee.selections.map(marqueeStateToTransformedRect)//.share()
            .merge(Rx.Observable.from([{all: true}]));
    const transformedDrags = marquee.drags.map(marqueeStateToTransformedRect)//.share()
            .merge(Rx.Observable.from([{all: true}]));

    return {
        bounds: marquee.selections,
        selections: transformedSelections,
        doneDragging: transformedSelections,
        drags: transformedDrags
    };
}

// -> Observable DOM
//Return which mouse group element selected
//Side effect: highlight that element
function clicksFromPopoutControls ($elt) {
    const mouseElements = $('.panel-button, .modal-button', $elt);

    return Rx.Observable.merge(
        ...mouseElements.get().map((elt) => {
            return Rx.Observable.fromEvent(elt, 'mousedown')
                .do((evt) => {
                    // Stop from propagating to canvas
                    evt.stopPropagation();
                })
                .switchMap(() => Rx.Observable.fromEvent(elt, 'mouseup'))
                .map(_.constant(elt))
                // .share();
        }))//.share();
}

function toggleLogo($cont, urlParams) {
    if ((urlParams.logo || '').toLowerCase() === 'false') {
        $cont.toggleClass('disabled', true);
    }
}

function createLegend($elt, urlParams) {
    if (!urlParams.legend) {
        return;
    }

    let legend;
    try {
        legend = JSON.parse(urlParams.legend);
    } catch (err) {
        console.error('Error parsing legend', err);
        return;
    }

    const $title = $elt.children('.legend-title');
    if (legend.title) {
        $title.append(legend.title);
    }
    if (legend.subtitle) {
        $title.after(legend.subtitle);
    }
    if (legend.nodes) {
        $elt.find('.legend-nodes').append(legend.nodes);
    }
    if (legend.edges) {
        $elt.find('.legend-edges').append(legend.edges);
    }

    $elt.show();
}

function toggleButton ($panelButton, newEnableValue) {
    $panelButton.find('i').toggleClass('toggle-on', newEnableValue);
}


function togglePanel ($panelButton, maybe$panel, newVisibility) {
    //TODO falcor
    toggleButton($panelButton, newVisibility);
    if (maybe$panel) {
        maybe$panel.toggleClass('open', newVisibility);
    }
}


//Observable DOM * $DOM * ?$DOM * String ->
//  {toggleStatus: Observable Bool,
//   toggle: Subject {null+undefined, boolean}
// Control button and panel toggle state
// Returns current state stream toggleStatus, and Subject toggle (similar to jquery's)
//   -- toggle: null/undefined causes a flip, otherwise  use truthiness for new state
//   -- self-click: flip
//   -- toggle-group-click: disable

//TODO falcor for this
//Subject {v: {undefined,null}+truthy, btn: DOM}
const globalStream = new Rx.Subject();
function setupPanelControl (toolbarClicks, $panelButton, maybe$panel) {

    //TODO falcor

    //Subject {undefined,null} + truthy
    const toggle = new Rx.Subject();

    //notify others about programmatic toggle
    toggle.map(v => ({v, elt: $panelButton[0]}))
        .subscribe(globalStream, util.makeErrorHandler('toggle broadcast'));

    // Observable {id: string, v: *}
    const toggleCmds =
        Rx.Observable.merge(

            //external self-toggle
            toggle.map(v => ({id: 'external-cmd', v})),

            //self-click
            toolbarClicks.filter((elt) => elt === $panelButton[0])
                .map(v => ({id: 'self-click', v})),

            //external toggle command: turn off if peer turned on
            globalStream.filter(({v, elt}) =>
                (v
                    && (elt != $panelButton[0])
                    && $(elt).attr('data-toggle-group')
                    && $panelButton.attr('data-toggle-group')
                    && $(elt).attr('data-toggle-group') === $panelButton.attr('data-toggle-group')))
                .map(v => ({id: 'group-click', v})),

            //toggle-group-tick (via menu)
            toolbarClicks
                .filter(elt =>
                        (elt != $panelButton[0])
                        && $(elt).attr('data-toggle-group')
                        && $panelButton.attr('data-toggle-group')
                        && $(elt).attr('data-toggle-group') === $panelButton.attr('data-toggle-group'))
                .map(v => ({id: 'group-click', v})));

    // Observable Boolean
    const toggleStatus =
        toggleCmds.scan((prevStatus, {id, v}) => {
                switch (id) {
                    case 'external-cmd':
                        return (v === undefined || v === null) ? !prevStatus
                        : v ? true
                        : false;
                    case 'self-click':
                        return !prevStatus;
                    case 'group-click':
                        return false;
                    default:
                        throw new Error({msg: 'unhandled cmd', val: [prevStatus, id, v]});
                }
            }, false)
        .startWith(false)
        .do((newVisibility) => {
            togglePanel($panelButton, maybe$panel, newVisibility);
        })
        .multicast(() => new Rx.ReplaySubject(1))
        .refCount()
        // .share();

    return {toggle, toggleStatus};

}

function setupCameraApi (appState) {
    const renderState = appState.renderState;
    const renderingScheduler = appState.renderingScheduler;
    const camera = renderState.get('camera');

    appState.apiActions
        .filter((e) => e.event === 'updateCamera')
        .do((e) => {
            camera.setPosition(e.cameraPosition);
            renderingScheduler.renderScene('cameraApi', {trigger: 'renderSceneFast'});
            appState.cameraChanges.onNext(camera);
        }).subscribe(_.identity, util.makeErrorHandler('api update camera'));
}


function init (appState, socket, $elt, doneLoading, workerParams, urlParams) {
    createLegend($('#graph-legend'), urlParams);
    toggleLogo($('.logo-container'), urlParams);
    const popoutClicks = clicksFromPopoutControls($elt);
    externalLink($('#externalLinkButtonContainer'), $('#externalLinkButton'), urlParams);
    fullscreenLink($('#externalLinkButtonContainer'), $('#fullscreenButton'), urlParams);

    const $graph = $('#simulate');
    // TODO: More general version for all toggle-able buttons?
    let marqueeIsOn = false;
    const $viewSelectionButton = $('#viewSelectionButton');


    //TODO abstract, & normalize button/panel names
    //TODO infer from DOM, and declare panel binding there?
    const marqueeOn = setupPanelControl(popoutClicks, $('#viewSelectionButton'));
    const histogramPanelToggle = setupPanelControl(popoutClicks, $('#histogramPanelControl'), $('#histogram.panel'));
    const dataInspectorOn = setupPanelControl(popoutClicks, $('#dataInspectorButton'), $('#inspector'));
    const timeExplorerOn = setupPanelControl(popoutClicks, $('#timeExplorerButton'), $('#timeExplorer'));
    const exclusionsOn = setupPanelControl(popoutClicks, $('#exclusionButton'), $('#exclusionsPanel'));
    const filtersOn = setupPanelControl(popoutClicks, $('#filterButton'), $('#filtersPanel'));
    const setsOn = setupPanelControl(popoutClicks, $('#setsPanelButton'), $('#setsPanel'));
    const settingsOn = setupPanelControl(popoutClicks, $('#layoutSettingsButton'), $('#renderingItems'));
    const turnOnBrush = setupPanelControl(popoutClicks, $('#brushButton'));

    //register
    [marqueeOn, histogramPanelToggle, dataInspectorOn, timeExplorerOn, exclusionsOn, filtersOn,
            setsOn, settingsOn, turnOnBrush]
            .forEach(pair =>
                pair.toggleStatus.subscribe(_.identity, util.makeErrorHandler('Toolbar icon clicker')));

    histogramPanelToggle.toggleStatus
        .do(on => $('body').toggleClass('with-histograms', on))
        .subscribe(_.identity, util.makeErrorHandler('histogram class state'));

    timeExplorerOn.toggleStatus
        .do((on) => {
            $('#timeExplorer').css('visibility', on ? 'visible' : 'hidden');
        }).subscribe(_.identity, util.makeErrorHandler('toggle histogram visibility from button'));

    marqueeOn.toggleStatus
        .map((marqueeIsOn) => { return marqueeIsOn ? ' toggled' : false; })
        .subscribe(appState.marqueeOn, util.makeErrorHandler('notify spatial selection changed'));

    //TODO do on every click instead? weird
    turnOnBrush.toggleStatus
        .map((s) => { return s ? 'toggled' : false})
        .subscribe(appState.brushOn, util.makeErrorHandler('brush toggle'));



    const $tooltips = $('#controlState [data-toggle="tooltip"]');
    const $bolt = $graph.find('.fa');
    const $center = $('#center');
    const $shrinkToFit = $center.find('.fa');
    const numTicks = urlParams.play !== undefined ? urlParams.play : 5000;


    /**
     * Returns whether camera auto-centering is specified; defaults to true.
     */
    const finalCenter = (() => {
        const flag = urlParams.center;
        return flag === undefined || flag.toString().toLowerCase() === 'true';
    })();

    const $simulation = $('#simulation');
    const centeringDone =
        Rx.Observable.merge(
            Rx.Observable.fromEvent($center, 'click'),
            Rx.Observable.fromEvent($graph, 'click'),
            $simulation.onAsObservable('mousewheel'),
            $simulation.onAsObservable('mousedown'),
            $('#zoomin').onAsObservable('click'),
            $('#zoomout').onAsObservable('click'))
        //skip events autoplay triggers
        .filter((evt) => evt.originalEvent !== undefined)
        .merge(Rx.Observable.timer(numTicks))
        .map(_.constant(finalCenter));

    const readyForHistograms = centeringDone.zip(doneLoading)
        .merge(histogramPanelToggle.toggleStatus)
        .take(1);

    const marquee = setupSelectionMarquee(appState, marqueeOn.toggleStatus);
    const brush = setupBrush(appState, turnOnBrush.toggleStatus);
    const filtersPanel = new FiltersPanel(socket, appState.labelRequests, filtersOn.toggle);
    const exclusionsPanel = new ExclusionsPanel(socket, filtersPanel.control, appState.labelRequests, exclusionsOn.toggle);
    const filtersResponses = filtersPanel.control.filtersResponsesSubject;
    const histogramBrush = new HistogramBrush(socket, filtersPanel, readyForHistograms,
        appState.latestHighlightedObject);
    histogramBrush.setupFiltersInteraction(filtersPanel, appState.poi);
    histogramBrush.setupMarqueeInteraction(brush);
    histogramBrush.setupApiInteraction(appState.apiActions);
    turnOnBrush.toggleStatus.first((value) => value === true).do(() => {
        histogramPanelToggle.toggle.onNext(true);
    }).subscribe(_.identity, util.makeErrorHandler('Enabling the histogram on first brush use.'));
    dataInspector.init(appState, socket, workerParams.href, brush, filtersResponses, dataInspectorOn.toggleStatus);
    forkVgraph(socket, urlParams);
    persist.setupPersistLayoutButton($('#persistButton'), appState, socket, urlParams);
    persist.setupPersistWorkbookButton($('#persistWorkbookButton'), appState, socket, urlParams);
    goLiveButton(socket, urlParams);
    const setsPanel = new SetsPanel(socket, appState.labelRequests, setsOn.toggle);
    setsPanel.setupFiltersPanelInteraction(filtersPanel);
    setsPanel.setupSelectionInteraction(appState.activeSelection, appState.latestHighlightedObject);

    /*const timeExplorer = */new TimeExplorer(socket, $('#timeExplorer'), filtersPanel);

    //tick stream until canceled/timed out (ends with finalCenter)
    const autoCentering =
        doneLoading.switchMap(() => {
            return Rx.Observable.interval(50)
                .do(() => { debug('auto center interval'); })
                .merge(centeringDone)
                .takeUntil(centeringDone.delay(1));
        });

    const isAutoCentering = new Rx.ReplaySubject(1);
    autoCentering.subscribe(isAutoCentering, util.makeErrorHandler('bad auto-center'));

    autoCentering.subscribe(
        (count) => {
            if (count === true ||
                typeof count === 'number' && ((count % 2 && count < 10) ||
                                             (count % 20 === 0 && count < 100) ||
                                              count % 100 === 0)) {
                $('#center').trigger('click');
            }
        },
        util.makeErrorHandler('autoCentering error'),
        () => {
            $shrinkToFit.toggleClass('automode', false).toggleClass('toggle-on', false);
        });


    doneLoading.take(1).subscribe(() => {
        if (numTicks > 0) {
            $tooltips.tooltip('show');
            $bolt.toggleClass('automode', true).toggleClass('toggle-on', true);
            appState.simulateOn.onNext(true);
            $shrinkToFit.toggleClass('automode', true).toggleClass('toggle-on', true);
        }
    }, util.makeErrorHandler('reveal scene'));


    doneLoading
        .do(runButton.bind('', appState, socket, urlParams, isAutoCentering))
        .subscribe(_.identity, util.makeErrorHandler('layout button'));

    setupCameraApi(appState);
}


module.exports = {
    init: init
};

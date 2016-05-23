'use strict';

const debug   = require('debug')('graphistry:StreamGL:graphVizApp:controls');
const $       = window.$;
const Rx      = require('rxjs/Rx.KitchenSink');
                require('../rx-jquery-stub');
const d3      = require('d3');
const _       = require('underscore');
const Color   = require('color');

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
const colorPicker     = require('./colorpicker.js');
const externalLink    = require('./externalLink.js');
const fullscreenLink  = require('./fullscreenLink.js');
const TimeExplorer    = require('./timeExplorer/timeExplorer.js');
const contentFormatter = require('./contentFormatter.js');
const Command         = require('./command.js');
const VizSlice        = require('./VizSlice.js');

function logScaling (minPos, maxPos, minVal, maxVal) {
    return d3.scale.log().domain([minVal, maxVal]).range([minPos, maxPos]);
}

const PercentScale = d3.scale.linear().domain([0, 1]).range([0, 100]);
const PointSizeScale = logScaling(1, 100, 0.1, 10);
const EdgeSizeScale = logScaling(1, 100, 0.1, 10);

// Setup client side controls.
const encodingPerElementParams = [
    {
        name: 'pointScaling',
        displayName: 'Point Size',
        type: 'discrete',
        value: 50.0,
        step: 1,
        max: 100.0,
        min: 1,
        scaling: PointSizeScale
    },
    {
        name: 'edgeScaling',
        displayName: 'Edge Size',
        type: 'discrete',
        value: 50.0,
        step: 1,
        max: 100.0,
        min: 1,
        scaling: EdgeSizeScale
    },
    {
        name: 'pointOpacity',
        displayName: 'Point Opacity',
        type: 'discrete',
        value: 100,
        step: 1,
        max: 100,
        min: 0,
        scaling: PercentScale
    },
    {
        name: 'edgeOpacity',
        displayName: 'Edge Opacity',
        type: 'discrete',
        value: 100,
        step: 1,
        max: 100,
        min: 0,
        scaling: PercentScale
    },
    {
        name: 'pruneOrphans',
        displayName: 'Prune Isolated Nodes',
        type: 'bool',
        value: false
    }
];


function createStyleElement() {
    const sheet = $('<style type="text/css">');
    sheet.appendTo($('head'));
    return sheet;
}


const encodingForLabelParams = [
   {
        name: 'labelForegroundColor',
        displayName: 'Text Color',
        type: 'color',
        def: new Color('#1f1f33').rgbaString(),
        cb: (() => {
            const sheet = createStyleElement();
            return (stream) => {
                stream.inspectTime(20).subscribe((c) => {
                    sheet.text('.graph-label, .graph-label table { color: ' + c.rgbaString() + ' }');
                });
            };
        })()
    },
    {
        name: 'labelBackgroundColor',
        displayName: 'Background Color',
        type: 'color',
        def: (new Color('#fff')).alpha(0.9).rgbaString(),
        cb: (() => {
            const sheet = createStyleElement();
            return (stream) => {
                stream.inspectTime(20).subscribe((c) => {
                    sheet.text('.graph-label .graph-label-container  { background-color: ' + c.rgbaString() + ' }');
                });
            };
        })()
    },
    {
        name: 'labelTransparency',
        displayName: 'Transparency',
        type: 'discrete',
        value: 100,
        step: 1,
        max: 100,
        min: 0,
        scaling: PercentScale
    },
    {
        name: 'labelsEnabled',
        displayName: 'Show Labels',
        type: 'bool',
        value: true
    },
    {
        name: 'poiEnabled',
        displayName: 'Points of Interest',
        type: 'bool',
        value: true
    }/*,
    {
        name: 'displayTimeZone',
        displayName: 'Display Time Zone',
        type: 'text',
        value: ''
    },*/

];




function setLayoutParameter(socket, algorithm, param, value, settingsChanges) {
    const update = {};
    const controls = {};

    update[param] = value;
    controls[algorithm] = update;

    const payload = {
        play: true,
        layout: true,
        simControls: controls
    };

    debug('Sending layout settings', payload);
    socket.emit('interaction', payload);
    settingsChanges.onNext({
        name: algorithm + '.' + param,
        value: value
    });
}

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
        const {tl, br} = marqueeState.lastRect;
        const tlWorld = transform(tl);
        const brWorld = transform(br);
        return {tl: tlWorld, br: brWorld};
    };

    const transformedSelections = marquee.selections.map(marqueeStateToTransformedRect).share();
    const transformedDrags = marquee.drags.map(marqueeStateToTransformedRect).share();

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
                .share();
        })).share();
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


//{?<param>: 'a'} * DOM *
//  {type: 'continuous' + 'discrete', name: string, min: num, max: num, step: num, value: num}
//  + {type: 'bool', name: string, value: bool}
//  + {type: 'color', name: string, def: CSSColor, cb: (Stream {r,g,b,a}) -> () }
//  * string -> DOM
// (Will append at anchor position)
function controlMaker (urlParams, param, type) {
    let $input;
    let initValue;
    switch (param.type) {
        case 'continuous':
            initValue = urlParams[param.name] ? parseFloat(urlParams[param.name]) : param.value;
            if (param.scaling !== undefined) {
                initValue = param.scaling(initValue);
            }
            $input = $('<input>').attr({
                class: type + '-menu-slider menu-slider',
                id: param.name,
                type: 'text',
                'data-slider-id': param.name + 'Slider',
                'data-slider-min': 0,
                'data-slider-max': 100,
                'data-slider-step': 1,
                'data-slider-value': initValue
            }).data('param', param);
            break;
        case 'discrete':
            initValue = urlParams.hasOwnProperty(param.name) ? parseFloat(urlParams[param.name]) : param.value;
            if (param.scaling !== undefined) {
                initValue = param.scaling(initValue);
            }
            $input = $('<input>').attr({
                class: type + '-menu-slider menu-slider',
                id: param.name,
                type: 'text',
                'data-slider-id': param.name + 'Slider',
                'data-slider-min': param.min,
                'data-slider-max': param.max,
                'data-slider-step': param.step,
                'data-slider-value': initValue
            }).data('param', param);
            break;
        case 'bool':
            initValue = urlParams.hasOwnProperty(param.name) ? (urlParams[param.name] === 'true' || urlParams[param.name] === true) : param.value;
            $input = $('<input>').attr({
                class: type + '-checkbox',
                id: param.name,
                type: 'checkbox',
                checked: initValue
            }).data('param', param);
            break;
        case 'color':
            initValue = urlParams[param.name] ? urlParams[param.name] : param.def;
            $input = $('<div>').css({display: 'inline-block'})
                .append($('<div>').addClass('colorSelector')
                    .append($('<div>').css({opacity: 0.3, background: 'white'})))
                .append($('<div>').addClass('colorHolder'));
            param.cb(colorPicker.makeInspector($input, initValue));
            break;
        case 'text': {
            const $innerInput = $('<input>').attr({
                class: type + '-control-textbox form-control control-textbox',
                id: param.name,
                type: 'text'
            }).data('param', param);

            const $button = $('<button class="btn btn-default control-textbox-button">Set</button>');

            const $wrappedInput = $('<div>').addClass('col-xs-8').addClass('inputWrapper')
                .css('padding-left', '0px')
                .append($innerInput);
            const $wrappedButton = $('<div>').addClass('col-xs-4').addClass('buttonWrapper')
                .css('padding-left', '0px')
                .append($button);

            $input = $('<div>').append($wrappedInput).append($wrappedButton);
            break;
        }
        default:
            console.warn('Ignoring param of unknown type', param);
            $input = $('<div>').text('Unknown setting type' + param.type);
    }

    const $col = $('<div>').addClass('col-xs-8').append($input);
    const $label = $('<label>').attr({
        for: param.name,
        class: 'control-label col-xs-4'
    }).text(param.displayName);

    return $('<div>')
        .addClass('form-group')
        .addClass(param.type === 'color' ? 'colorer' : param.type)
        .append($label, $col);
}


function createControlHeader ($anchor, name) {
    $('<div>')
        .addClass('control-title').text(name)
        .appendTo($anchor);
}


function createControls (socket, appState, urlParams) {
    const getControlsCommand = new Command('Get layout controls', 'layout_controls', socket);
    const rxControls = getControlsCommand.sendWithObservableResult(null)
        .map((res) => {
            if (res && res.success) {
                debug('Received layout controls from server', res.controls);
                return res.controls;
            } else {
                throw Error((res||{}).error || 'Cannot get layout_controls');
            }
        });

    const $renderingItems = $('#renderingItems');
    const $anchor = $renderingItems.children('.form-horizontal');

    //start open offscreen for bootstrap insanity
    $renderingItems.css({'left': '100%'}).toggleClass('open', true);

    Rx.Observable.combineLatest(rxControls, appState.viewConfigChanges, (controls, viewConfig) => {
        const parameters = viewConfig.parameters;
        // TODO fix this so whitelisted urlParams can update viewConfig.parameters, and then those affect/init values.
        _.extend(urlParams, parameters);

        //workaround: https://github.com/nostalgiaz/bootstrap-switch/issues/446
        setTimeout(() => {
            $('#renderingItems').css({'left': '5em'}).toggleClass('open', false);
        }, 2000);

        //APPEARANCE
        createControlHeader($anchor, 'Appearance');
        _.each(encodingPerElementParams, (param) => {
            $anchor.append(controlMaker(parameters, param, 'local'));
        });

        //LABELS
        createControlHeader($anchor, 'Labels');
        _.each(encodingForLabelParams, (param) => {
            $anchor.append(controlMaker(parameters, param, 'local'));
        });

        //LAYOUT
        _.each(controls, (la) => {
            createControlHeader($anchor, la.name);
            _.each(la.params, (param) => {
                $anchor.append(controlMaker(parameters, param, 'layout'));
            });
        });

        $('#renderingItems').find('[type=checkbox]').each(function () {
            const $that = $(this);
            const input = this;
            $(input).bootstrapSwitch();
            const param = $(input).data('param');
            $(input).onAsObservable('switchChange.bootstrapSwitch').subscribe(
                () => {
                    if ($that.hasClass('layout-checkbox')) {
                        setLayoutParameter(socket, param.algoName, param.name, input.checked, appState.settingsChanges);
                    } else if ($that.hasClass('local-checkbox')) {
                        setViewParameter(socket, param.name, input.checked, appState);
                    }
                },
                util.makeErrorHandler('menu checkbox')
            );
        });


        $('.menu-slider').each(function () {
            const $that = $(this);
            const $slider = $(this).bootstrapSlider({tooltip: 'hide'});
            const param = $slider.data('param');

            Rx.Observable.merge(
                $slider.onAsObservable('slide'),
                $slider.onAsObservable('slideStop')
            ).distinctUntilChanged()
            .inspectTime(50)
            .subscribe(
                () => {
                    if ($that.hasClass('layout-menu-slider')) {
                        setLayoutParameter(socket, param.algoName,
                                    param.name, Number($slider.val()), appState.settingsChanges);
                    } else if ($that.hasClass('local-menu-slider')) {
                        setViewParameter(socket, param.name, Number($slider.val()), appState);
                    }
                },
                util.makeErrorHandler('menu slider')
            );
        });

        $('.control-textbox-button').each(function () {
            const input = this;

            $(input).onAsObservable('click')
                .do((evt) => {
                    const $button = $(evt.target);
                    const $input = $button.parent().siblings('.inputWrapper').first()
                        .children('.control-textbox').first();
                    const val = $input.val();
                    const param = $input.data('param');

                    if ($input.hasClass('layout-control-textbox')) {
                        console.log('Layout control textboxes are not supported yet.');
                    } else if ($input.hasClass('local-control-textbox')) {
                        setViewParameter(socket, param.name, val, appState);
                    }

                })
                .subscribe(_.identity, util.makeErrorHandler('control text box'));
        });


    })
    .subscribe(_.identity, util.makeErrorHandler('createControls'));
}


function setViewParameter(socket, name, pos, appState) {
    const camera = appState.renderState.get('camera');
    let val = pos;

    function setUniform(key, value) {
        const uniforms = appState.renderState.get('uniforms');
        _.each(uniforms, (map) => {
            if (key in map) {
                map[key] = value;
            }
        });
    }

    switch (name) {
        case 'pointScaling':
            val = PointSizeScale.invert(pos);
            camera.setPointScaling(val);
            break;
        case 'edgeScaling':
            val = EdgeSizeScale.invert(pos);
            camera.setEdgeScaling(val);
            break;
        case 'pointOpacity':
            val = PercentScale.invert(pos);
            setUniform(name, [val]);
            break;
        case 'edgeOpacity':
            val = PercentScale.invert(pos);
            setUniform(name, [val]);
            break;
        case 'labelTransparency': {
            let opControl = $('#labelOpacity');
            if (!opControl.length) {
                opControl = $('<style>').appendTo($('body'));
            }
            val = PercentScale.invert(pos);
            opControl.text('.graph-label { opacity: ' + val + '; }');
            break;
        }
        case 'displayTimeZone':
            contentFormatter.setTimeZone(val);
            break;
        case 'poiEnabled':
            appState.poiIsEnabled.onNext(val);
            break;
        case 'labelsEnabled':
            if (val) {
                $('.graph-label-container').show();
            } else {
                $('.graph-label-container').hide();
            }
            break;
    }

    socket.emit('update_view_parameter', {name: name, value: val}, (response) => {
        if (!response.success) {
            throw Error('Update view parameter failed.');
        }
    });
    appState.settingsChanges.onNext({name: name, value: pos});
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


//Observable DOM * $DOM * ?$DOM * String -> Observable Bool
//When toolbarClicks is $panelButton or has same data-toggle-group attr,
// toggle $panelButton and potentially show $panel,
// else toggle off $panelButton and hide $panel
//Return toggle status stream
function setupPanelControl (toolbarClicks, $panelButton, maybe$panel) {

    //TODO falcor
    return Rx.Observable.merge(

            //toggle on self-click
            toolbarClicks.filter((elt) => elt === $panelButton[0]).map(() => {
                return !$panelButton.find('i').hasClass('toggle-on');
            }),

            //disable on same-toggle-group click
            toolbarClicks
                .filter((elt) => elt != $panelButton[0])
                .filter((elt) => $(elt).attr('data-toggle-group')
                        && $panelButton.attr('data-toggle-group')
                        && $(elt).attr('data-toggle-group') === $panelButton.attr('data-toggle-group'))
                .map(() => { return false }))
        .do((newVisibility) => {
            togglePanel($panelButton, maybe$panel, newVisibility);
        })
        .share();
}

function setupCameraApi (appState) {
    const renderState = appState.renderState;
    const renderingScheduler = appState.renderingScheduler;
    const camera = renderState.get('camera');

    appState.apiActions
        .filter((e) => e.event === 'updateCamera')
        .do((e) => {
            console.log('RECEIVED API UPDATE CAMERA: ', e.cameraPosition);
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

    Rx.Observable.merge(...[
            marqueeOn, histogramPanelToggle, dataInspectorOn, timeExplorerOn, exclusionsOn, filtersOn,
            setsOn, settingsOn, turnOnBrush])
        .subscribe(_.identity, util.makeErrorHandler('Toolbar icon clicks'));

    histogramPanelToggle
        .do(on => $('body').toggleClass('with-histograms', on))
        .subscribe(_.identity, util.makeErrorHandler('histogram class state'));

    marqueeOn
        .map((marqueeIsOn) => { return marqueeIsOn ? ' toggled' : false; })
        .subscribe(appState.marqueeOn, util.makeErrorHandler('notify spatial selection changed'));

    //TODO do on every click instead? weird
    turnOnBrush
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
        .merge(histogramPanelToggle)
        .take(1);

    const marquee = setupSelectionMarquee(appState, marqueeOn);
    const brush = setupBrush(appState, turnOnBrush);
    const filtersPanel = new FiltersPanel(socket, appState.labelRequests, appState.settingsChanges);
    const exclusionsPanel = new ExclusionsPanel(socket, filtersPanel.control, appState.labelRequests);
    const filtersResponses = filtersPanel.control.filtersResponsesSubject;
    const histogramBrush = new HistogramBrush(socket, filtersPanel, readyForHistograms,
        appState.activeSelection);
    histogramBrush.setupFiltersInteraction(filtersPanel, appState.poi);
    histogramBrush.setupMarqueeInteraction(brush);
    histogramBrush.setupApiInteraction(appState.apiActions);
    turnOnBrush.first((value) => value === true).do(() => {
        togglePanel($('#histogramPanelControl'), $('#histogram.panel'), true);
    }).subscribe(_.identity, util.makeErrorHandler('Enabling the histogram on first brush use.'));
    dataInspector.init(appState, socket, workerParams.href, brush, filtersResponses, dataInspectorOn);
    forkVgraph(socket, urlParams);
    persist.setupPersistLayoutButton($('#persistButton'), appState, socket, urlParams);
    persist.setupPersistWorkbookButton($('#persistWorkbookButton'), appState, socket, urlParams);
    goLiveButton(socket, urlParams);
    const setsPanel = new SetsPanel(socket, appState.labelRequests);
    setsPanel.setupFiltersPanelInteraction(filtersPanel);
    setsPanel.setupSelectionInteraction(appState.activeSelection, appState.latestHighlightedObject);

    /*const timeExplorer = */new TimeExplorer(socket, $('#timeExplorer'), filtersPanel);

    createControls(
        socket,
        appState,
        urlParams);

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

    appState.apiActions
        .filter((e) => e.event === 'updateSetting')
        .do((e) => {
            setViewParameter(socket, e.setting, e.value, appState);
        }).subscribe(_.identity, util.makeErrorHandler('updateSetting'));

    setupCameraApi(appState);
}


module.exports = {
    init: init
};

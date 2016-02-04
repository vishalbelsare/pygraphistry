'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:controls');
var $       = window.$;
var Rx      = require('rxjs/Rx.KitchenSink');
              require('../rx-jquery-stub');
var d3      = require('d3');
var _       = require('underscore');
var Color   = require('color');

var util            = require('./util.js');
var dataInspector   = require('./dataInspector.js');
var FiltersPanel    = require('./filtersPanel.js');
var ExclusionsPanel = require('./ExclusionsPanel.js');
var SetsPanel       = require('./setsPanel.js');
var HistogramBrush  = require('./histogramBrush.js');
var marqueeFact     = require('./marquee.js');
var runButton       = require('./runButton.js');
var forkVgraph      = require('./fork.js');
var persist         = require('./persist.js');
var goLiveButton    = require('./goLiveButton.js');
var colorPicker     = require('./colorpicker.js');
var externalLink    = require('./externalLink.js');
var TimeExplorer    = require('./timeExplorer.js');
var contentFormatter = require('./contentFormatter.js');

// Setup client side controls.
var encodingPerElementParams = [
    {
        name: 'pointScaling',
        displayName: 'Point Size',
        type: 'discrete',
        value: 50.0,
        step: 1,
        max: 100.0,
        min: 1
    },
    {
        name: 'edgeScaling',
        displayName: 'Edge Size',
        type: 'discrete',
        value: 50.0,
        step: 1,
        max: 100.0,
        min: 1
    },
    {
        name: 'pointOpacity',
        displayName: 'Point Opacity',
        type: 'discrete',
        value: 100,
        step: 1,
        max: 100,
        min: 0
    },
    {
        name: 'edgeOpacity',
        displayName: 'Edge Opacity',
        type: 'discrete',
        value: 100,
        step: 1,
        max: 100,
        min: 0
    },
    {
        name: 'pruneOrphans',
        displayName: 'Prune Isolated Nodes',
        type: 'bool',
        value: false
    }
];


function createStyleElement() {
    var sheet = $('<style type="text/css">');
    sheet.appendTo($('head'));
    return sheet;
}


var encodingForLabelParams = [
    {
        name: 'labelsEnabled',
        displayName: 'Show Labels',
        type: 'bool',
        value: true
    },
    {
        name: 'labelForegroundColor',
        displayName: 'Text Color',
        type: 'color',
        def: new Color('#1f1f33'),
        cb: (function () {
            var sheet = createStyleElement();
            return function (stream) {
                stream.inspectTime(20).subscribe(function (c) {
                    sheet.text('.graph-label, .graph-label table { color: ' + c.rgbaString() + ' }');
                });
            };
        }())
    },
    {
        name: 'labelBackgroundColor',
        displayName: 'Background Color',
        type: 'color',
        def: (new Color('#fff')).alpha(0.9),
        cb: (function () {
            var sheet = createStyleElement();
            return function (stream) {
                stream.inspectTime(20).subscribe(function (c) {
                    sheet.text('.graph-label .graph-label-container  { background-color: ' + c.rgbaString() + ' }');
                });
            };
        }())
    },
    {
        name: 'labelTransparency',
        displayName: 'Transparency',
        type: 'discrete',
        value: 100,
        step: 1,
        max: 100,
        min: 0
    },
    {
        name: 'poiEnabled',
        displayName: 'Points of Interest',
        type: 'bool',
        value: true
    },
    {
        name: 'displayTimeZone',
        displayName: 'Display Time Zone',
        type: 'text',
        value: ''
    }
];




function setLayoutParameter(socket, algorithm, param, value, settingsChanges) {
    var update = {};
    var controls = {};

    update[param] = value;
    controls[algorithm] = update;

    var payload = {
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

//Observable bool -> { ... }
function setupMarquee(appState, isOn) {
    var camera = appState.renderState.get('camera');
    var cnv = appState.renderState.get('canvas');
    var transform = function (point) {
        return camera.canvas2WorldCoords(point.x, point.y, cnv);
    };

    var marquee = marqueeFact.initMarquee(appState, $('#marquee'), isOn, {transform: transform});

    marquee.selections.subscribe(function (sel) {
        debug('marquee selected bounds', sel);
    }, util.makeErrorHandler('bad marquee selections'));

    marquee.drags.subscribe(function (drag) {
        debug('marquee drag action', drag.start, drag.end);
    }, util.makeErrorHandler('bad marquee drags'));

    return marquee;
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
    var camera = appState.renderState.get('camera');
    var cnv = appState.renderState.get('canvas');
    var transform = function (point) {
        return camera.canvas2WorldCoords(point.x, point.y, cnv);
    };

    var brush = marqueeFact.initBrush(appState, $('#brush'), isOn, {transform: transform});

    brush.selections.subscribe(function (sel) {
        debug('brush selected bounds', sel);
    }, util.makeErrorHandler('bad brush selections'));

    brush.drags.subscribe(function (drag) {
        debug('brush drag action', drag.start, drag.end);
    }, util.makeErrorHandler('bad brush drags'));

    return brush;
}

// -> Observable DOM
//Return which mouse group element selected
//Side effect: highlight that element
function clicksFromPopoutControls($elt) {
    var mouseElements = $('.panel-button, .modal-button', $elt);

    return Rx.Observable.merge.apply(Rx.Observable,
        mouseElements.get().map(function (elt) {
            return Rx.Observable.fromEvent(elt, 'mousedown')
                .do(function (evt) {
                    // Stop from propagating to canvas
                    evt.stopPropagation();
                })
                .switchMap(function () {
                    return Rx.Observable.fromEvent(elt, 'mouseup');
                })
                .map(_.constant(elt));
        }));
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

    var legend;
    try {
        legend = JSON.parse(urlParams.legend);
    } catch (err) {
        console.error('Error parsing legend', err);
        return;
    }

    var $title = $elt.children('.legend-title');
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
    var $input;
    if (param.type === 'continuous') {
        $input = $('<input>').attr({
            class: type + '-menu-slider menu-slider',
            id: param.name,
            type: 'text',
            'data-slider-id': param.name + 'Slider',
            'data-slider-min': 0,
            'data-slider-max': 100,
            'data-slider-step': 1,
            'data-slider-value': urlParams[param.name] ? parseFloat(urlParams[param.name]) : param.value
        }).data('param', param);
    } else if (param.type === 'discrete') {
        $input = $('<input>').attr({
            class: type + '-menu-slider menu-slider',
            id: param.name,
            type: 'text',
            'data-slider-id': param.name + 'Slider',
            'data-slider-min': param.min,
            'data-slider-max': param.max,
            'data-slider-step': param.step,
            'data-slider-value': urlParams[param.name] ? parseFloat(urlParams[param.name]) : param.value
        }).data('param', param);
    } else if (param.type === 'bool') {
        $input = $('<input>').attr({
            class: type + '-checkbox',
            id: param.name,
            type: 'checkbox',
            checked: urlParams.hasOwnProperty(param.name) ? (urlParams[param.name] === 'true' || urlParams[param.name] === true) : param.value
        }).data('param', param);
    } else if (param.type === 'color') {
        $input = $('<div>').css({display: 'inline-block'})
            .append($('<div>').addClass('colorSelector')
                .append($('<div>').css({opacity: 0.3, background: 'white'})))
            .append($('<div>').addClass('colorHolder'));
        param.cb(colorPicker.makeInspector($input, urlParams[param.name] ? urlParams[param.name] : param.def));
    }else if (param.type === 'text') {

        var $innerInput = $('<input>').attr({
            class: type + '-control-textbox form-control control-textbox',
            id: param.name,
            type: 'text'
        }).data('param', param);

        var $button = $('<button class="btn btn-default control-textbox-button">Set</button>');

        var $wrappedInput = $('<div>').addClass('col-xs-8').addClass('inputWrapper')
            .css('padding-left', '0px')
            .append($innerInput);
        var $wrappedButton = $('<div>').addClass('col-xs-4').addClass('buttonWrapper')
            .css('padding-left', '0px')
            .append($button);

        $input = $('<div>').append($wrappedInput).append($wrappedButton);

    } else {
        console.warn('Ignoring param of unknown type', param);
        $input = $('<div>').text('Unknown setting type' + param.type);
    }

    var $col = $('<div>').addClass('col-xs-8').append($input);
    var $label = $('<label>').attr({
        for: param.name,
        class: 'control-label col-xs-4'
    }).text(param.displayName);

    return $('<div>')
        .addClass('form-group')
        .addClass(param.type === 'color' ? 'colorer' : param.type)
        .append($label, $col);
}


function createControlHeader($anchor, name) {
    $('<div>')
        .addClass('control-title').text(name)
        .appendTo($anchor);
}


function createControls(socket, appState, trigger, urlParams) {

    var rxControls = Rx.Observable.bindCallback(socket.emit.bind(socket))('layout_controls', null)
        .map(function (res) {
            if (res && res.success) {
                debug('Received layout controls from server', res.controls);
                return res.controls;
            } else {
                throw Error((res||{}).error || 'Cannot get layout_controls');
            }
        });

    var $renderingItems = $('#renderingItems');
    var $anchor = $renderingItems.children('.form-horizontal');

    $renderingItems.css({'display': 'block', 'left': '100%'});

    Rx.Observable.combineLatest(rxControls, appState.viewConfigChanges, function (controls, viewConfig) {
        var parameters = viewConfig.parameters;
        // TODO fix this so whitelisted urlParams can update viewConfig.parameters, and then those affect/init values.
        _.extend(urlParams, parameters);

        //workaround: https://github.com/nostalgiaz/bootstrap-switch/issues/446
        setTimeout(function () {
            $('#renderingItems').css({'display': 'none', 'left': '5em'});
        }, 2000);

        //APPEARANCE
        createControlHeader($anchor, 'Appearance');
        _.each(encodingPerElementParams, function (param) {
            $anchor.append(controlMaker(parameters, param, 'local'));
        });

        //LABELS
        createControlHeader($anchor, 'Labels');
        _.each(encodingForLabelParams, function (param) {
            $anchor.append(controlMaker(parameters, param, 'local'));
        });

        //LAYOUT
        _.each(controls, function (la) {
            createControlHeader($anchor, la.name);
            _.each(la.params, function (param) {
                $anchor.append(controlMaker(parameters, param, 'layout'));
            });
        });

        $('#renderingItems').find('[type=checkbox]').each(function () {
            var $that = $(this);
            var input = this;
            $(input).bootstrapSwitch();
            var param = $(input).data('param');
            $(input).onAsObservable('switchChange.bootstrapSwitch').subscribe(
                function () {
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
            var $that = $(this);
            var $slider = $(this).bootstrapSlider({tooltip: 'hide'});
            var param = $slider.data('param');

            Rx.Observable.merge(
                $slider.onAsObservable('slide'),
                $slider.onAsObservable('slideStop')
            ).distinctUntilChanged()
            .inspectTime(50)
            .subscribe(
                function () {
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
            var input = this;

            $(input).onAsObservable('click')
                .do(function (evt) {
                    var $button = $(evt.target);
                    var $input = $button.parent().siblings('.inputWrapper').first()
                        .children('.control-textbox').first();
                    var val = $input.val();
                    var param = $input.data('param');

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

function logScaling(minPos, maxPos, minVal, maxVal) {
    return d3.scale.log().domain([minVal, maxVal]).range([minPos, maxPos]);
}

var PercentScale = d3.scale.linear().domain([0, 1]).range([0, 100]);
var PointSizeScale = logScaling(1, 100, 0.1, 10);
var EdgeSizeScale = logScaling(1, 100, 0.1, 10);


function setViewParameter(socket, name, pos, appState) {
    var camera = appState.renderState.get('camera');
    var val = pos;

    function setUniform(name, value) {
        var uniforms = appState.renderState.get('uniforms');
        _.each(uniforms, function (map) {
            if (name in map) {
                map[name] = value;
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
            setUniform('pointOpacity', [val]);
            break;
        case 'edgeOpacity':
            val = PercentScale.invert(pos);
            setUniform('edgeOpacity', [val]);
            break;
        case 'labelTransparency':
            var opControl = $('#labelOpacity');
            if (!opControl.length) {
                opControl = $('<style>').appendTo($('body'));
            }
            val = PercentScale.invert(pos);
            opControl.text('.graph-label { opacity: ' + val + '; }');
            break;
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

    socket.emit('update_view_parameter', {name: name, value: val}, function (response) {
        if (!response.success) {
            throw Error('Update view parameter failed.');
        }
    });
    appState.settingsChanges.onNext({name: name, value: pos});
}


function toggleButton ($panelButton, newEnableValue) {
    $panelButton.find('i').toggleClass('toggle-on', newEnableValue);
}


function togglePanel ($panelButton, $panel, newVisibility) {
    toggleButton($panelButton, newVisibility);
    $panel.toggle(newVisibility);
    $panel.css('visibility', newVisibility ? 'visible': 'hidden');
}


//Observable DOM * $DOM * $DOM * String -> Observable Bool
//When toolbarClicks is $panelButton,
// toggle $panelButton and potentially show $panel,
// else toggle off $panelButton and hide $panel
//Return toggle status stream
function setupPanelControl (toolbarClicks, $panelButton, $panel, errorLogLabel) {
    var panelToggles = toolbarClicks.filter(function (elt) {
        return elt === $panelButton[0];
    }).map(function () {
        // return the target state (boolean negate)
        return !$panel.is(':visible');
    });
    panelToggles.do(function (newVisibility) {
        togglePanel($panelButton, $panel, newVisibility);
    }).subscribe(_.identity, util.makeErrorHandler(errorLogLabel));
    return panelToggles;
}

function setupCameraApi (appState) {
    var renderState = appState.renderState;
    var renderingScheduler = appState.renderingScheduler;
    var camera = renderState.get('camera');

    appState.apiActions
        .filter(function (e) { return e.event === 'updateCamera'; })
        .do(function (e) {
            console.log('RECIEVED API UPDATE CAMERA: ', e.cameraPosition);
            camera.setPosition(e.cameraPosition);
            renderingScheduler.renderScene('cameraApi', {trigger: 'renderSceneFast'});
            appState.cameraChanges.onNext(camera);
        }).subscribe(_.identity, util.makeErrorHandler('api update camera'));
}


function init (appState, socket, $elt, doneLoading, workerParams, urlParams) {
    createLegend($('#graph-legend'), urlParams);
    toggleLogo($('.logo-container'), urlParams);
    var popoutClicks = clicksFromPopoutControls($elt);
    externalLink($('#externalLinkButton'), urlParams);

    var $graph = $('#simulate');
    // TODO: More general version for all toggle-able buttons?
    var marqueeIsOn = false;
    var $viewSelectionButton = $('#viewSelectionButton');
    var turnOnMarquee =
        Rx.Observable.merge(
            popoutClicks.filter(function (elt) {
                return elt === $viewSelectionButton[0]; })
                .map(function () { return !marqueeIsOn; }),
            Rx.Observable.fromEvent($graph, 'click')
                .map(_.constant(false)))
        .do(function (isTurnOn) {
            marqueeIsOn = isTurnOn;
            toggleButton($viewSelectionButton, marqueeIsOn);
            appState.marqueeOn.onNext(marqueeIsOn ? 'toggled' : false);
        });
    var histogramPanelToggle = setupPanelControl(popoutClicks, $('#histogramPanelControl'), $('#histogram.panel'),
        'Turning on/off the histogram panel');
    var dataInspectorIsVisible = false;
    var dataInspectorOnSubject = new Rx.Subject();
    var $dataInspectorButton = $('#dataInspectorButton');
    dataInspectorOnSubject.onNext(false);
    popoutClicks.filter(function (elt) {
        return elt === $dataInspectorButton[0];
    }).do(function () {
        dataInspectorIsVisible = !dataInspectorIsVisible;
        dataInspectorOnSubject.onNext(dataInspectorIsVisible);
        toggleButton($dataInspectorButton, dataInspectorIsVisible);
        $('#inspector').css('visibility', dataInspectorIsVisible ? 'visible' : 'hidden');
    }).subscribe(_.identity, util.makeErrorHandler('dataInspector visibility toggle'));


    // histogram brush:
    var brushIsOn = false;
    // Use separate subject so downstream subscribers don't trigger control changes twice.
    // TODO: Figure out the correct pattern for this.
    var turnOnBrush = new Rx.Subject();
    popoutClicks
        .merge(
            Rx.Observable.fromEvent($graph, 'click')
            .map(_.constant($graph[0])))
        .map(function (elt) {
            var $brushButton = $('#brushButton');
            if (elt === $brushButton[0]) {
                toggleButton($(elt));
                brushIsOn = !brushIsOn;
            } else if (brushIsOn &&
                    (elt === $viewSelectionButton[0] || elt === $graph[0])) {
                brushIsOn = false;
                toggleButton($brushButton, false);
            }
            if (brushIsOn) {
                appState.brushOn.onNext('toggled');
            } else {
                appState.brushOn.onNext(false);
            }
            turnOnBrush.onNext(brushIsOn);
        }).subscribe(_.identity, util.makeErrorHandler('brush toggle'));

    setupPanelControl(popoutClicks, $('#layoutSettingsButton'),  $('#renderingItems'), 'Turning on/off settings');

    var $tooltips = $('[data-toggle="tooltip"]');
    var $bolt = $graph.find('.fa');
    var $center = $('#center');
    var $shrinkToFit = $center.find('.fa');
    var numTicks = urlParams.play !== undefined ? urlParams.play : 5000;


    /**
     * Returns whether camera auto-centering is specified; defaults to true.
     */
    var finalCenter = (function () {
        var flag = urlParams.center;
        return flag === undefined || flag.toString().toLowerCase() === 'true';
    }());

    var $simulation = $('#simulation');
    var centeringDone =
        Rx.Observable.merge(
            Rx.Observable.fromEvent($center, 'click'),
            Rx.Observable.fromEvent($graph, 'click'),
            $simulation.onAsObservable('mousewheel'),
            $simulation.onAsObservable('mousedown'),
            $('#zoomin').onAsObservable('click'),
            $('#zoomout').onAsObservable('click'))
        //skip events autoplay triggers
        .filter(function (evt){ return evt.originalEvent !== undefined; })
        .merge(Rx.Observable.timer(numTicks))
        .map(_.constant(finalCenter));

    var readyForHistograms = centeringDone.zip(doneLoading)
        .merge(histogramPanelToggle)
        .take(1);

    var marquee = setupMarquee(appState, turnOnMarquee);
    var brush = setupBrush(appState, turnOnBrush);
    var filtersPanel = new FiltersPanel(socket, appState.labelRequests, appState.settingsChanges);
    filtersPanel.setupToggleControl(popoutClicks, $('#filterButton'));
    var exclusionsPanel = new ExclusionsPanel(socket, filtersPanel.control, appState.labelRequests);
    exclusionsPanel.setupToggleControl(popoutClicks, $('#exclusionButton'));
    var filtersResponses = filtersPanel.control.filtersResponsesSubject;
    var histogramBrush = new HistogramBrush(socket, filtersPanel, readyForHistograms);
    histogramBrush.setupFiltersInteraction(filtersPanel, appState.poi);
    histogramBrush.setupMarqueeInteraction(brush);
    histogramBrush.setupApiInteraction(appState.apiActions);
    turnOnBrush.first(function (value) { return value === true; }).do(function () {
        togglePanel($('#histogramPanelControl'), $('#histogram.panel'), true);
    }).subscribe(_.identity, util.makeErrorHandler('Enabling the histogram on first brush use.'));
    dataInspector.init(appState, socket, workerParams.href, brush, histogramPanelToggle, filtersResponses, dataInspectorOnSubject);
    forkVgraph(socket, urlParams);
    persist.setupPersistLayoutButton($('#persistButton'), appState, socket, urlParams);
    persist.setupPersistWorkbookButton($('#persistWorkbookButton'), appState, socket, urlParams);
    goLiveButton(socket, urlParams);
    var setsPanel = new SetsPanel(socket, urlParams);
    setsPanel.setupFiltersPanelInteraction(filtersPanel);
    setsPanel.setupToggleControl(popoutClicks, $('#setsPanelButton'));
    setsPanel.setupSelectionInteraction(appState.activeSelection, appState.latestHighlightedObject);

    var timeExplorer = new TimeExplorer(socket, $('#timeExplorer'), filtersPanel);

    createControls(
        socket,
        appState,
        popoutClicks
            .filter(function (elt) { return elt === $('#layoutSettingsButton')[0]; })
            .take(1),
        urlParams);

    Rx.Observable.zip(
        marquee.drags,
        marquee.drags.switchMap(function () {
            return marquee.selections.take(1);
        }),
        function(a, b) { return {drag: a, selection: b}; }
    ).subscribe(function (move) {
        var payload = {marquee: move};
        socket.emit('move_nodes', payload);
    }, util.makeErrorHandler('marquee error'));


    //tick stream until canceled/timed out (ends with finalCenter)
    var autoCentering =
        doneLoading.switchMap(function () {
            return Rx.Observable.interval(50)
                .do(function () { debug('auto center interval'); })
                .merge(centeringDone)
                .takeUntil(centeringDone.delay(1));
        });

    var isAutoCentering = new Rx.ReplaySubject(1);
    autoCentering.subscribe(isAutoCentering, util.makeErrorHandler('bad auto-center'));

    autoCentering.subscribe(
        function (count) {
            if (count === true ||
                typeof count === 'number' && ((count % 2 && count < 10) ||
                                             (count % 20 === 0 && count < 100) ||
                                              count % 100 === 0)) {
                $('#center').trigger('click');
            }
        },
        util.makeErrorHandler('autoCentering error'),
        function () {
            $shrinkToFit.toggleClass('automode', false).toggleClass('toggle-on', false);
        });


    doneLoading.take(1).subscribe(function () {
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
        .filter(function (e) { return e.event === 'updateSetting'; })
        .do(function (e) {
            setViewParameter(socket, e.setting, e.value, appState);
        }).subscribe(_.identity, util.makeErrorHandler('updateSetting'));

    setupCameraApi(appState);
}


module.exports = {
    init: init,
};

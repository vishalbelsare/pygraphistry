'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:controls');
var $       = window.$;
var Rx      = require('rxjs/Rx.KitchenSink');
              require('../rx-jquery-stub');
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


// Setup client side controls.
var encodingPerElementParams = [
    {
        name: 'pointSize',
        prettyName: 'Point Size',
        type: 'discrete',
        value: 50.0,
        step: 1,
        max: 100.0,
        min: 1
    },
    {
        name: 'edgeSize',
        prettyName: 'Edge Size',
        type: 'discrete',
        value: 50.0,
        step: 1,
        max: 100.0,
        min: 1
    },
    {
        name: 'pointOpacity',
        prettyName: 'Point Opacity',
        type: 'discrete',
        value: 100,
        step: 1,
        max: 100,
        min: 0
    },
    {
        name: 'edgeOpacity',
        prettyName: 'Edge Opacity',
        type: 'discrete',
        value: 100,
        step: 1,
        max: 100,
        min: 0
    }
];


function createStyleElement() {
    var sheet = $('<style type="text/css">');
    sheet.appendTo($('head'));
    return sheet;
}


var encodingForLabelParams = [
    {
        name: 'labels',
        prettyName: 'Show Labels',
        type: 'bool',
        value: true,
    },
    {
        name: 'labelFgColor',
        prettyName: 'Text Color',
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
        name: 'labelBgColor',
        prettyName: 'Background Color',
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
        prettyName: 'Transparency',
        type: 'discrete',
        value: 100,
        step: 1,
        max: 100,
        min: 0
    },
    {
        name: 'poi',
        prettyName: 'Points of Interest',
        type: 'bool',
        value: true,
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
        simControls: controls,
    };

    debug('Sending layout settings', payload);
    socket.emit('interaction', payload);
    settingsChanges.onNext({
        name: algorithm + '.' + param,
        value: value,
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
function controlMaker (urlParams, $anchor, appState, param, type) {
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
    } else {
        console.warn('Ignoring param of unknown type', param);
        $input = $('<div>').text('Unknown setting type' + param.type);
    }

    var $col = $('<div>').addClass('col-xs-8').append($input);
    var $label = $('<label>').attr({
        for: param.name,
        class: 'control-label col-xs-4'
    }).text(param.prettyName);

    var $entry = $('<div>')
        .addClass('form-group')
        .addClass(param.type === 'color' ? 'colorer' : param.type)
        .append($label, $col);

    $anchor.append($entry);

    return $entry;
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

    var makeControl = controlMaker.bind('', urlParams, $anchor, appState);


    $renderingItems.css({'display': 'block', 'left': '100%'});
    rxControls
    .do(function (controls) {
        //workaround: https://github.com/nostalgiaz/bootstrap-switch/issues/446
        setTimeout(function () {
            $('#renderingItems').css({'display': 'none', 'left': '5em'});
        }, 2000);

        //APPEARANCE
        createControlHeader($anchor, 'Appearance');
        _.each(encodingPerElementParams, function (param) {
            makeControl(param, 'local');
        });

        //LABELS
        createControlHeader($anchor, 'Labels');
        _.each(encodingForLabelParams, function (param) {
            makeControl(param, 'local');
        });

        //LAYOUT
        _.each(controls, function (la) {
            createControlHeader($anchor, la.name);
            _.each(la.params, function (param) {
                makeControl(param, 'layout');
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
                        setViewParameter(param.name, input.checked, appState);
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
                        setViewParameter(param.name, Number($slider.val()), appState);
                    }
                },
                util.makeErrorHandler('menu slider')
            );
        });

    })
    .subscribe(_.identity, util.makeErrorHandler('createControls'));
}

function toLog(minPos, maxPos, minVal, maxVal, pos) {
    var logMinVal = Math.log(minVal);
    var logMaxVal = Math.log(maxVal);
    var scale = (logMaxVal - logMinVal) / (maxPos - minPos);
    return Math.exp(logMinVal + scale * (pos - minPos));
}


function toPercent(pos) {
    return pos / 100;
}


function setViewParameter(name, pos, appState) {
    var camera = appState.renderState.get('camera');
    var val = 0;

    function setUniform(name, value) {
        var uniforms = appState.renderState.get('uniforms');
        _.each(uniforms, function (map) {
            if (name in map) {
                map[name] = value;
            }
        });
    }

    switch (name) {
        case 'pointSize':
            val = toLog(1, 100, 0.1, 10, pos);
            camera.setPointScaling(val);
            break;
        case 'edgeSize':
            val = toLog(1, 100, 0.1, 10, pos);
            camera.setEdgeScaling(val);
            break;
        case 'pointOpacity':
            val = toPercent(pos);
            setUniform('pointOpacity', [val]);
            break;
        case 'edgeOpacity':
            val = toPercent(pos);
            setUniform('edgeOpacity', [val]);
            break;
        case 'labelTransparency':
            var opControl = $('#labelOpacity');
            if (!opControl.length) {
                opControl = $('<style>').appendTo($('body'));
            }
            opControl.text('.graph-label { opacity: ' + toPercent(pos) + '; }');
            break;
        case 'poi':
            val = pos;
            appState.poiIsEnabled.onNext(val);
            break;
        case 'labels':
            if (pos) {
                $('.graph-label-container').show();
            } else {
                $('.graph-label-container').hide();
            }
            break;
        default:
            console.error('Unknown local setting', name);
            return;
    }

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
    var filtersPanel = new FiltersPanel(socket, appState.labelRequests);
    filtersPanel.setupToggleControl(popoutClicks, $('#filterButton'));
    var exclusionsPanel = new ExclusionsPanel(socket, filtersPanel.control, appState.labelRequests);
    exclusionsPanel.setupToggleControl(popoutClicks, $('#exclusionButton'));
    var filtersResponses = filtersPanel.control.filtersResponsesSubject;
    var histogramBrush = new HistogramBrush(socket, filtersPanel, readyForHistograms);
    histogramBrush.setupFiltersInteraction(filtersPanel, appState.poi);
    histogramBrush.setupMarqueeInteraction(brush);
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
        var payload = {play: true, layout: true, marquee: move};
        socket.emit('interaction', payload);
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
            setViewParameter(e.setting, e.value, appState);
        }).subscribe(_.identity, util.makeErrorHandler('updateSetting'));

    setupCameraApi(appState);
}


module.exports = {
    init: init,
};

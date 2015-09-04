'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:controls');
var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');
var _       = require('underscore');
var Color   = require('color');

var util            = require('./util.js');
var dataInspector   = require('./dataInspector.js');
var histogramBrush  = require('./histogramBrush.js');
var marqueeFact     = require('./marquee.js');
var runButton       = require('./runButton.js');
var forkVgraph      = require('./fork.js');
var persistButton   = require('./persist.js');
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
        min: 1
    },
    {
        name: 'edgeOpacity',
        prettyName: 'Edge Opacity',
        type: 'discrete',
        value: 100,
        step: 1,
        max: 100,
        min: 1
    }
];


function createStyleElement() {
    var sheet = $('<style type="text/css">');
    sheet.appendTo($('head'));
    return sheet;
}


var encodingForLabelParams = [
    {
        name: 'labelFgColor',
        prettyName: 'Text Color',
        type: 'color',
        def: new Color('#1f1f33'),
        cb: (function () {
            var sheet = createStyleElement();
            return function (stream) {
                stream.sample(20).subscribe(function (c) {
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
                stream.sample(20).subscribe(function (c) {
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
        min: 1
    }
];




function sendLayoutSetting(socket, algo, param, value) {
    var update = {};
    var controls = {};

    update[param] = value;
    controls[algo] = update;

    var payload = {
        play: true,
        layout: true,
        simControls: controls,
    };

    debug('Sending layout settings', payload);
    socket.emit('interaction', payload);
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
function makeMouseSwitchboard() {

    var mouseElts = $('#marqueerectangle, #histogramBrush, #layoutSettingsButton, #filterButton, #histogramPanelControl');

    var onElt = Rx.Observable.merge.apply(Rx.Observable,
            mouseElts.get().map(function (elt) {
                return Rx.Observable.fromEvent(elt, 'mousedown')
                .do(function (evt) {
                    // Stop from propagating to canvas
                    evt.stopPropagation();
                })
                .flatMapLatest(function () {
                    return Rx.Observable.fromEvent(elt, 'mouseup');
                })
                .map(_.constant(elt));
            }));

    return onElt;
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
function controlMaker (urlParams, $anchor, param, type) {
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
            id: param.name,
            type: 'checkbox',
            checked: urlParams[param.name] ? urlParams[param.name] === 'true' : param.value
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
        class: 'control-label col-xs-4',
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

    var rxControls = Rx.Observable.fromCallback(socket.emit, socket)('layout_controls', null)
        .map(function (res) {
            if (res && res.success) {
                debug('Received layout controls from server', res.controls);
                return res.controls;
            } else {
                throw new Error((res||{}).error || 'Cannot get layout_controls');
            }
        });

    var $renderingItems = $('#renderingItems');
    var $anchor = $renderingItems.children('.form-horizontal');

    var makeControl = controlMaker.bind('', urlParams, $anchor);


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
            var input = this;
            $(input).bootstrapSwitch();
            var param = $(input).data('param');
            $(input).onAsObservable('switchChange.bootstrapSwitch').subscribe(
                function () {
                    sendLayoutSetting(socket, param.algoName, param.name, input.checked);
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
            .throttleFirst(50)
            .subscribe(
                function () {
                    if ($that.hasClass('layout-menu-slider')) {
                        sendLayoutSetting(socket, param.algoName,
                                    param.name, Number($slider.val()));
                    } else if ($that.hasClass('local-menu-slider')) {
                        setLocalSetting(param.name, Number($slider.val()),
                                        appState.renderState, appState.settingsChanges);
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


function setLocalSetting(name, pos, renderState, settingsChanges) {
    var camera = renderState.get('camera');
    var val = 0;

    function setUniform(name, value) {
        var uniforms = renderState.get('uniforms');
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
            return;
        default:
            break;
    }

    settingsChanges.onNext({name: name, val: val});
}


//Observable DOM * $DOM * $DOM * String -> Observable Bool
//When onElt is $a, toggle $a and potentially show $menu, else toggle off $a and hide $menu
//Return toggle status stream
function menuToggler (onElt, $a, $menu, errLbl) {

    var isOn = false;

    var turnOn = onElt.map(function (elt) {
        if (elt === $a[0]) {
            $(elt).children('i').toggleClass('toggle-on');
            isOn = !isOn;
        } else {
            isOn = false;
            $a.children('i').removeClass('toggle-on');
        }
        return isOn;
    });

    turnOn.distinctUntilChanged().do(function (state) {
        if (state) {
            $menu.css('display', 'block');
        } else {
            $menu.css('display', 'none');
        }
    }).subscribe(_.identity, util.makeErrorHandler(errLbl));

    return turnOn;
}



function init (appState, socket, $elt, doneLoading, workerParams, urlParams) {
    createLegend($('#graph-legend'), urlParams);
    toggleLogo($('.logo-container'), urlParams);
    var onElt = makeMouseSwitchboard();
    externalLink($('#externalLinkButton'));

    // TODO: More general version for all toggle-able buttons?
    var marqueeIsOn = false;
    var $graph = $('#simulate');
    var turnOnMarquee =
        Rx.Observable.merge(
            onElt.filter(function (elt) { return elt === $('#marqueerectangle')[0]; })
                .map(function () { return !marqueeIsOn; }),
            onElt.filter(function (elt) { return elt === $('#histogramBrush')[0]; })
                .map(_.constant(false)),
            Rx.Observable.fromEvent($graph, 'click')
                .map(_.constant(false)))
        .do(function (isTurnOn) {
            marqueeIsOn = isTurnOn;
            $('#marqueerectangle').children('i').toggleClass('toggle-on', marqueeIsOn);
            appState.marqueeOn.onNext(marqueeIsOn ? 'toggled' : false);
        });

    var histogramPanelIsOpen = false;
    Rx.Observable.merge(
            onElt.filter(function (elt) { return elt === $('#histogramPanelControl')[0]; })
                .map(function () { return !histogramPanelIsOpen; }),
            onElt.filter(function (elt) { return elt === $('#histogramBrush')[0]; })
                .map(_.constant(true)))
        .do(function (isTurnOn) {
            histogramPanelIsOpen = isTurnOn;
            $('#histogramPanelControl').children('i').toggleClass('toggle-on', marqueeIsOn);
            $('#histogram.panel').css('visibility', isTurnOn ? 'visible' : 'hidden');
        }).subscribe(_.identity, util.makeErrorHandler('histogram visibility toggle'));



    // histogram brush:
    var brushIsOn = false;
    var turnOnBrush = onElt
        .merge(
            Rx.Observable.fromEvent($graph, 'click')
            .map(_.constant($graph[0])))
        .map(function (elt) {
            if (elt === $('#histogramBrush')[0]) {
                $(elt).children('i').toggleClass('toggle-on');
                brushIsOn = !brushIsOn;
            } else if (brushIsOn &&
                    (elt === $('#marqueerectangle')[0] || elt === $graph[0])) {
                brushIsOn = false;
                $('#histogramBrush').children('i').toggleClass('toggle-on', false);
            }
            if (brushIsOn) {
                appState.brushOn.onNext('toggled');
            } else {
                $('#inspector').css('visibility', 'hidden');
                appState.brushOn.onNext(false);
            }
            return brushIsOn;
        });

    menuToggler(onElt, $('#layoutSettingsButton'),  $('#renderingItems'), 'Turning on/off settings');
    menuToggler(onElt, $('#filterButton'),  $('#filtersPanel'), 'Turning on/off the filter panel');


    var marquee = setupMarquee(appState, turnOnMarquee);
    var brush = setupBrush(appState, turnOnBrush);
    dataInspector.init(appState, socket, workerParams.href, brush);
    histogramBrush.init(socket, urlParams, brush, appState.poi);
    forkVgraph(socket, urlParams);
    persistButton(appState, socket, urlParams);
    goLiveButton(socket, urlParams);

    createControls(
        socket,
        appState,
        onElt
            .filter(function (elt) { return elt === $('#layoutSettingsButton')[0]; })
            .take(1),
        urlParams);

    Rx.Observable.zip(
        marquee.drags,
        marquee.drags.flatMapLatest(function () {
            return marquee.selections.take(1);
        }),
        function(a, b) { return {drag: a, selection: b}; }
    ).subscribe(function (move) {
        var payload = {play: true, layout: true, marquee: move};
        socket.emit('interaction', payload);
    }, util.makeErrorHandler('marquee error'));

    var $tooltips = $('[data-toggle="tooltip"]');
    var $bolt = $('#simulate .fa');
    var $shrinkToFit = $('#center .fa');
    var numTicks = urlParams.play !== undefined ? urlParams.play : 5000;


    /**
     * Returns whether camera auto-centering is specified; defaults to true.
     */
    var finalCenter = (function () {
        var flag = urlParams.center;
        return flag === undefined || flag.toString().toLowerCase() === 'true';
    }());


    var centeringDone =
        Rx.Observable.merge(
            Rx.Observable.fromEvent($('#center'), 'click'),
            Rx.Observable.fromEvent($graph, 'click'),
            $('#simulation').onAsObservable('mousewheel'),
            $('#simulation').onAsObservable('mousedown'),
            $('#zoomin').onAsObservable('click'),
            $('#zoomout').onAsObservable('click'))
        //skip events autoplay triggers
        .filter(function (evt){ return evt.originalEvent !== undefined; })
        .merge(Rx.Observable.timer(numTicks))
        .map(_.constant(finalCenter));

    //tick stream until canceled/timed out (ends with finalCenter)
    var autoCentering =
        doneLoading.flatMapLatest(function () {
            return Rx.Observable.interval(1000)
                .do(function () { console.log('auto center interval'); })
                .merge(centeringDone)
                .takeUntil(centeringDone.delay(1));
        });

    var isAutoCentering = new Rx.ReplaySubject(1);
    autoCentering.subscribe(isAutoCentering, util.makeErrorHandler('bad autocenter'));

    autoCentering.subscribe(
        function (count) {
            if (count === true ||
                typeof count === 'number' && (count < 3  ||
                                             (count % 2 === 0 && count < 10) ||
                                              count % 10 === 0)) {
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


}


module.exports = {
    init: init
};

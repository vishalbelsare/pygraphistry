'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:controls');
var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');
var _       = require('underscore');

var util            = require('./util.js');
var dataInspector   = require('./dataInspector.js');
var histogramBrush  = require('./histogramBrush.js');
var marqueeFact     = require('./marquee.js');

var ui      = require('../ui.js');


var INTERACTION_INTERVAL = 50;


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
function setupMarquee(isOn, renderState) {
    var camera = renderState.get('camera');
    var cnv = renderState.get('canvas');
    var transform = function (point) {
        return camera.canvas2WorldCoords(point.x, point.y, cnv);
    };

    var marquee = marqueeFact.initMarquee(renderState, $('#marquee'), isOn, {transform: transform});

    marquee.selections.subscribe(function (sel) {
        debug('selected bounds', sel);
    }, util.makeErrorHandler('bad marquee selections'));

    marquee.drags.subscribe(function (drag) {
        debug('drag action', drag.start, drag.end);
    }, util.makeErrorHandler('bad marquee drags'));

    return marquee;
}

// TODO: impl
function setupBrush(isOn, renderState) {
    var camera = renderState.get('camera');
    var cnv = renderState.get('canvas');
    var transform = function (point) {
        return camera.canvas2WorldCoords(point.x, point.y, cnv);
    };

    var marquee = marqueeFact.initBrush(renderState, $('#marquee'), isOn, {transform: transform});

    marquee.selections.subscribe(function (sel) {
        debug('selected bounds', sel);
    }, util.makeErrorHandler('bad marquee selections'));

    marquee.drags.subscribe(function (drag) {
        debug('drag action', drag.start, drag.end);
    }, util.makeErrorHandler('bad marquee drags'));

    return marquee;
}

// -> Observable DOM
//Return which mouse group element selected
//Side effect: highlight that element
function makeMouseSwitchboard() {

    var mouseElts = $('#marqueerectangle').add('#histogramBrush');

    var onElt = Rx.Observable.merge.apply(Rx.Observable,
            mouseElts.get().map(function (elt) {
                return Rx.Observable.fromEvent(elt, 'click').map(_.constant(elt));
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
        legend = JSON.parse(decodeURIComponent(urlParams.legend));
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

function createControls(socket) {
    var rxControls = Rx.Observable.fromCallback(socket.emit, socket)('layout_controls', null)
        .map(function (res) {
            if (res && res.success) {
                debug('Received layout controls from server', res.controls);
                return res.controls;
            } else {
                throw new Error((res||{}).error || 'Cannot get layout_controls');
            }
        });

    var makeControl = function (param, type) {
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
                'data-slider-value': param.value
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
                'data-slider-value': param.value
            }).data('param', param);

        } else if (param.type === 'bool') {
            $input = $('<input>').attr({
                id: param.name,
                type: 'checkbox',
                checked: param.value
            }).data('param', param);
        } else {
            console.warn('Ignoring param of unknown type', param);
            $input = $('<div>').text('Unknown setting type' + param.type);
        }
        var $col = $('<div>').addClass('col-xs-8').append($input);
        var $label = $('<label>').attr({
            for: param.name,
            class: 'control-label col-xs-4',
        }).text(param.prettyName);

        var $entry = $('<div>').addClass('form-group').append($label, $col);

        $anchor.append($entry);
    };

    var $anchor = $('#renderingItems').children('.form-horizontal').empty();
    rxControls.subscribe(function (controls) {
        // Setup client side controls.
        var localParams = [
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
            }
        ];

        var $heading = $('<div>').addClass('control-title').text('Appearance');
        $anchor.append($heading);
        _.each(localParams, function (param) {
            makeControl(param, 'local');
        });

        // Setup layout controls
        _.each(controls, function (la) {
            var $heading = $('<div>').addClass('control-title').text(la.name);
            $anchor.append($heading);
            _.each(la.params, function (param) {
                makeControl(param, 'layout');
            });
        });

    }, util.makeErrorHandler('createControls'));

    return rxControls;
}

function toLog(minPos, maxPos, minVal, maxVal, pos) {
    var logMinVal = Math.log(minVal);
    var logMaxVal = Math.log(maxVal);
    var scale = (logMaxVal - logMinVal) / (maxPos - minPos);
    return Math.exp(logMinVal + scale * (pos - minPos));
}


function setLocalSetting(name, pos, renderState, settingsChanges) {
    var camera = renderState.get('camera');
    var val = 0;

    if (name === 'pointSize') {
        val = toLog(1, 100, 0.1, 10, pos);
        camera.setPointScaling(val);
    } else if (name === 'edgeSize') {
        val = toLog(1, 100, 0.1, 10, pos);
        camera.setEdgeScaling(val);
    }

    settingsChanges.onNext({name: name, val: val});
}

function init (socket, $elt, renderState, vboUpdates, workerParams, urlParams, appState) {
    createLegend($('#graph-legend'), urlParams);
    toggleLogo($('.logo-container'), urlParams);
    var onElt = makeMouseSwitchboard();

    // TODO: More general version for all toggle-able buttons?
    var marqueeIsOn = false;
    var turnOnMarquee = onElt.map(function (elt) {
        if (elt === $('#marqueerectangle')[0]) {
            $(elt).children('i').toggleClass('toggle-on');
            marqueeIsOn = !marqueeIsOn;
        }
        appState.marqueeOn.onNext(marqueeIsOn);
        return marqueeIsOn;
    });

    var brushIsOn = false;
    var turnOnBrush = onElt.map(function (elt) {
        if (elt === $('#histogramBrush')[0]) {
            $(elt).children('i').toggleClass('toggle-on');
            brushIsOn = !brushIsOn;
        }
        return brushIsOn;
    });

    var marquee = setupMarquee(turnOnMarquee, renderState);
    var brush = setupBrush(turnOnBrush, renderState);
    dataInspector.init(socket, workerParams.url, marquee);
    histogramBrush.init(socket, brush);


    var timeSlide = new Rx.Subject();
    $('#timeSlider').rangeSlider({
        bounds: {min: 0, max: 100},
        arrows: false,
        defaultValues: {min: 0, max: 30},
        valueLabels: 'hide', //show, change, hide
        //wheelMode: 'zoom'
    });

    //FIXME: replace $OLD w/ browserfied jquery+jqrangeslider
    $('#timeSlider').on('valuesChanging', function (e, data) {
            timeSlide.onNext({min: data.values.min, max: data.values.max});
            appState.poi.invalidateCache();
        });

    timeSlide.sample(3)
        .do(function (when) {
            var payload = {
                play: true, layout: false,
                timeSubset: {min: when.min, max: when.max}
            };
            socket.emit('interaction', payload);
        })
        .subscribe(_.identity, util.makeErrorHandler('timeSlide'));

    createControls(socket).subscribe(function () {
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
            .sample(50)
            .subscribe(
                function () {
                    if ($that.hasClass('layout-menu-slider')) {
                        sendLayoutSetting(socket, param.algoName,
                                    param.name, Number($slider.val()));
                    } else if ($that.hasClass('local-menu-slider')) {
                        setLocalSetting(param.name, Number($slider.val()), renderState, appState.settingsChanges);
                    }
                },
                util.makeErrorHandler('menu slider')
            );
        });

    }, util.makeErrorHandler('bad controls'));

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

    var doneLoading = vboUpdates.filter(function (update) {
        return update === 'rendered';
    }).take(1).do(ui.hideSpinnerShowBody).delay(700);
    var numTicks = urlParams.play !== undefined ? urlParams.play : 5000;

    doneLoading.take(1).subscribe(function () {
        if (numTicks > 0) {
            $tooltips.tooltip('show');
            $bolt.toggleClass('automode', true).toggleClass('toggle-on', true);
            appState.simulateOn.onNext(true);
            $shrinkToFit.toggleClass('automode', true).toggleClass('toggle-on', true);
        }
    }, util.makeErrorHandler('reveal scene'));

    // Tick stream until canceled/timed out (end with 'false'), starts after first vbo update.
    var autoLayingOut = doneLoading.flatMapLatest(function () {
        return Rx.Observable.merge(
            Rx.Observable.return(Rx.Observable.interval(20)),
            Rx.Observable.merge(
                    $('#simulate').onAsObservable('click')
                        .filter(function (evt){ return evt.originalEvent !== undefined; }),
                    Rx.Observable.timer(numTicks))
                .take(1)
                .map(_.constant(Rx.Observable.return(false))))
        .flatMapLatest(_.identity);
    });

    //tick stream until canceled/timed out (end with 'false')
    var autoCentering = doneLoading.flatMapLatest(function () {
        return Rx.Observable.merge(
            Rx.Observable.return(Rx.Observable.interval(1000)),
            Rx.Observable.merge(
                    Rx.Observable.merge(
                            Rx.Observable.fromEvent($('#center'), 'click'),
                            Rx.Observable.fromEvent($('#simulate'), 'click'),
                            $('#simulation').onAsObservable('mousewheel'),
                            $('#simulation').onAsObservable('mousedown'),
                            $('#zoomin').onAsObservable('click'),
                            $('#zoomout').onAsObservable('click'))
                        //skip events autoplay triggers
                        .filter(function (evt){ return evt.originalEvent !== undefined; }),
                    Rx.Observable.timer(numTicks))
                .take(1)
                .map(_.constant(Rx.Observable.return(false))))
        .flatMapLatest(_.identity);
    });
    var isAutoCentering = new Rx.ReplaySubject(1);
    autoCentering.subscribe(isAutoCentering, util.makeErrorHandler('bad autocenter'));

    var runLayout =
        Rx.Observable.fromEvent($('#simulate'), 'click')
            .map(function () { return $bolt.hasClass('toggle-on'); })
            .do(function (wasOn) {
                $bolt.toggleClass('toggle-on', !wasOn);
            })
            .flatMapLatest(function (wasOn) {
                var isOn = !wasOn;
                appState.simulateOn.onNext(isOn);
                return isOn ? Rx.Observable.interval(INTERACTION_INTERVAL) : Rx.Observable.empty();
            });

    runLayout
        .subscribe(
            function () { socket.emit('interaction', {play: true, layout: true}); },
            util.makeErrorHandler('Error stimulating graph'));

    autoLayingOut.subscribe(
        function (evt) {
            if (evt !== false) {
                var payload = {play: true, layout: true};
                socket.emit('interaction', payload);
            }
        },
        util.makeErrorHandler('autoLayingOut error'),
        function () {
            isAutoCentering.take(1).subscribe(function (v) {
                if (v !== false) {
                    $('#center').trigger('click');
                }
            });
            $tooltips.tooltip('hide');
            $bolt.removeClass('automode').removeClass('toggle-on');
            appState.simulateOn.onNext(false);
        }
    );

    autoCentering.subscribe(
        function (count) {
            if (count === false || count < 3  ||
                (count % 2 === 0 && count < 10) ||
                count % 10 === 0) {
                $('#center').trigger('click');
            }
        },
        util.makeErrorHandler('autoCentering error'),
        function () {
            $shrinkToFit.toggleClass('automode', false).toggleClass('toggle-on', false);
        });

}


module.exports = {
    init: init
};

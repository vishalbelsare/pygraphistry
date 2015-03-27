'use strict';

// FIXME: Move this to graph-viz repo -- it shouldn't be a part of the core StreamGL library

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:vizApp');
var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');
var _       = require('underscore');

var interaction     = require('./interaction.js');
var marqueeFact     = require('./marquee.js');
var shortestpaths   = require('./shortestpaths.js');
var colorpicker     = require('./colorpicker.js');
var util            = require('./util.js');
var dataInspector   = require('./dataInspector.js');
var histogramBrush  = require('./histogramBrush.js');
var labels          = require('./labels.js');

var renderer        = require('../renderer');
var poiLib          = require('../poi.js');
var ui              = require('../ui.js');

var poi;



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

var INTERACTION_INTERVAL = 50;
var DEBOUNCE_TIME = 60;


///////////////////////////////////////////////////////////////////////////////
// Event handler setup
///////////////////////////////////////////////////////////////////////////////

// //Observable DOM
var labelHover = new Rx.Subject();

//render most of scene on refresh, but defer slow hitmap (readPixels)
var lastRender = new Rx.Subject();
function renderScene(renderer, currentState, data) {
    lastRender.onNext({renderer: renderer, currentState: currentState, data: data});
}


// Determine if it's a quiet/noisy state
var startRendering = lastRender
    .scan({prev: null, cur: null}, function (acc, v) { return {prev: acc.cur, cur: v}; })
    .filter(function (pair) {
        return (!pair.prev || (pair.cur.data.renderTag !== pair.prev.data.renderTag));
    })
    .sample(DEBOUNCE_TIME);

var stopRendering = lastRender
    .scan({prev: null, cur: null}, function (acc, v) { return {prev: acc.cur, cur: v}; })
    .filter(function (pair) {
        return (!pair.prev || (pair.cur.data.renderTag !== pair.prev.data.renderTag));
    })
    .debounce(DEBOUNCE_TIME);
var currentlyRendering = new Rx.ReplaySubject(1);

// What to do when starting noisy/rendering state
startRendering
    .do(function () {
        $('.graph-label-container').css('display', 'none');
    })
    .do(function () {
        currentlyRendering.onNext(true);
    })
    .subscribe(_.identity, util.makeErrorHandler('Start Rendering'));

// What to do when exiting noisy/rendering state
stopRendering
    .filter(function() {
        // TODO: Pull this from a proper stream in a refactor instead of a global dom object
        return !$('#simulate .fa').hasClass('toggle-on');
    })
    .do(function (pair) {
        pair.cur.renderer.render(pair.cur.currentState, 'interactionPicking', null,
            {renderListOverride: ['pointpicking', 'edgepicking', 'pointsampling']});
    })
    .do(function () {
        $('.graph-label-container').css('display', 'block');
    })
    .do(function () {
        currentlyRendering.onNext(false);
    })
    .subscribe(_.identity, util.makeErrorHandler('Stop Rendering'));

//Render gpu items, text on reqAnimFrame
//Slower, update the pointpicking sampler (does GPU->CPU transfer)
lastRender
    .bufferWithTime(10)
    .filter(function (arr) { return arr.length; })
    .map(function (arr) {
        var res = arr[arr.length - 1];
        _.extend(res.data,
            arr.reduce(
                function (acc, v) {
                    return {
                        data: {
                            renderTag: Math.max(v.data.renderTag, acc.data.renderTag),
                            labelTag: Math.max(v.data.labelTag, acc.data.labelTag)
                        }
                    };
                },
                {data: { renderTag: 0, labelTag: 0}}));
        return res;
    })
    .scan({prev: null, cur: null}, function (acc, v) { return {prev: acc.cur, cur: v}; })
    .do(function (pair) {
        var cfg = pair.cur;
        if (!pair.prev || (cfg.data.renderTag !== pair.prev.data.renderTag)) {
            cfg.renderer.render(cfg.currentState, 'interactionRender');
        }

        labels.renderCursor(cfg.currentState, new Float32Array(cfg.data.curPoints.buffer),
                     cfg.data.highlightIndices, new Uint8Array(cfg.data.pointSizes.buffer));
    })
    .pluck('cur')
    .scan({prev: null, cur: null}, function (acc, v) { return {prev: acc.cur, cur: v}; })
    .bufferWithTime(80)
    .filter(function (arr) { return arr.length; })
    .map(function (arr) {
        var res = arr[arr.length - 1];
        _.extend(res.data,
            arr.reduce(
                function (acc, v) {
                    return {
                        renderTag: Math.max(v.renderTag, acc.renderTag),
                        labelTag: Math.max(v.labelTag, acc.labelTag)
                    };
                },
                {data: { renderTag: 0, labelTag: 0}}));
        return res;
    })
    .subscribe(_.identity, util.makeErrorHandler('render effect'));


function setupDragHoverInteractions($eventTarget, renderState, bgColor, settingsChanges) {
    //var currentState = renderState;
    var stateStream = new Rx.Subject();
    var latestState = new Rx.ReplaySubject(1);
    stateStream.subscribe(latestState, util.makeErrorHandler('bad stateStream'));
    stateStream.onNext(renderState);

    var camera = renderState.get('camera');
    var canvas = renderState.get('canvas');

    var $marquee = $('#marqueerectangle i.fa');

    //pan/zoom
    //Observable Event
    var interactions;
    if(interaction.isTouchBased) {
        debug('Detected touch-based device. Setting up touch interaction event handlers.');
        var eventTarget = $eventTarget[0];
        interactions = interaction.setupSwipe(eventTarget, camera)
            .merge(
                interaction.setupPinch($eventTarget, camera)
                .filter(function () { return !$marquee.hasClass('toggle-on'); }));
    } else {
        debug('Detected mouse-based device. Setting up mouse interaction event handlers.');
        interactions = interaction.setupDrag($eventTarget, camera)
            .merge(interaction.setupScroll($eventTarget, canvas, camera));

    }
    interactions = Rx.Observable.merge(
        interactions,
        interaction.setupCenter($('#center'),
                                renderState.get('hostBuffers').curPoints,
                                camera),
        interaction.setupZoomButton($('#zoomin'), camera, 1 / 1.25)
            .filter(function () { return !$marquee.hasClass('toggle-on'); }),
        interaction.setupZoomButton($('#zoomout'), camera, 1.25)
            .filter(function () { return !$marquee.hasClass('toggle-on'); })
    );

    // Picks objects in priority based on order.
    var hitMapTextures = ['hitmap'];
    var latestHighlightedObject = labels.getLatestHighlightedObject($eventTarget, renderState, labelHover, hitMapTextures, poi);

    var $labelCont = $('<div>').addClass('graph-label-container');
    $eventTarget.append($labelCont);
    labels.setupLabels($labelCont, latestState, latestHighlightedObject, labelHover, currentlyRendering, poi);


    //TODO refactor this is out of place
    var stateWithColor =
        bgColor.map(function (rgb) {

            var currentState = renderState;

            var color = [[rgb.r/256, rgb.g/256, rgb.b/256,
                rgb.a === undefined ? 1 : rgb.a/256]];

            var config = currentState.get('config');
            var options = config.get('options');

            return currentState.set('config',
                    config.set('options',
                        options.set('clearColor', color)));
        });

    //render scene on pan/zoom (get latest points etc. at that time)
    //tag render changes & label changes
    var renderStateUpdates = interactions
        .flatMapLatest(function (camera) {
            return Rx.Observable.combineLatest(
                renderState.get('hostBuffers').curPoints,
                renderState.get('hostBuffers').pointSizes,
                stateWithColor,
                settingsChanges,
                function (curPoints, pointSizes, renderState, settingsChange) {
                    return {renderTag: Date.now(),
                            camera: camera,
                            curPoints: curPoints,
                            pointSizes: pointSizes,
                            settingsChange: settingsChange,
                            renderState: renderState};
                });
        })
        .flatMapLatest(function (data) {
            // TODO: pass in dim. Handle Dim.
            // Temporary hack -- ignore edges.
            return latestHighlightedObject.map(function (highlightIndices) {
                return _.extend({labelTag: Date.now(), highlightIndices: highlightIndices}, data);
            });
        })
        .do(function(data) {
            var currentState = renderer.setCameraIm(data.renderState, data.camera);
            stateStream.onNext(currentState);
            renderScene(renderer, currentState, data);
        })
        .pluck('renderState');

    return renderStateUpdates;
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


// ... -> Observable renderState
function init(socket, $elt, renderState, vboUpdates, workerParams, urlParams) {
    createLegend($('#graph-legend'), urlParams);
    toggleLogo($('.logo-container'), urlParams);

    poi = poiLib(socket);

    var onElt = makeMouseSwitchboard();

    // TODO: More general version for all toggle-able buttons?
    var marqueeIsOn = false;
    var turnOnMarquee = onElt.map(function (elt) {
        if (elt === $('#marqueerectangle')[0]) {
            $(elt).children('i').toggleClass('toggle-on');
            marqueeIsOn = !marqueeIsOn;
        }
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

    var settingsChanges = new Rx.ReplaySubject(1);
    settingsChanges.onNext({});

    var colors = colorpicker($('#foregroundColor'), $('#backgroundColor'), socket);
    var renderStateUpdates = setupDragHoverInteractions($elt, renderState, colors.backgroundColor, settingsChanges);

    shortestpaths($('#shortestpath'), poi, socket);

    $('#timeSlider').rangeSlider({
        bounds: {min: 0, max: 100},
        arrows: false,
        defaultValues: {min: 0, max: 30},
        valueLabels: 'hide', //show, change, hide
        //wheelMode: 'zoom'
    });

    var timeSlide = new Rx.Subject();
    //FIXME: replace $OLD w/ browserfied jquery+jqrangeslider
    $('#timeSlider').on('valuesChanging', function (e, data) {
            timeSlide.onNext({min: data.values.min, max: data.values.max});
            poi.invalidateCache();
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
                        setLocalSetting(param.name, Number($slider.val()), renderState, settingsChanges);
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

    return renderStateUpdates;
}


module.exports = init;

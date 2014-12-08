'use strict';

// FIXME: Move this to graph-viz repo -- it shouldn't be a part of the core StreamGL library

var debug   = require('debug')('uber:main');
var Rx      = require('rx');
var $       = require('jquery');
var _       = require('underscore');
var Slider  = require('bootstrap-slider');


var interaction = require('./interaction.js');
var renderer    = require('./renderer');
var poi      = require('./poi.js')();



function sendSetting(socket, name, value) {
    var payload = {};
    payload[name] = value;

    socket.emit('graph_settings', payload);
    debug('settings', payload);
}


var HIGHLIGHT_SIZE = 20;



///////////////////////////////////////////////////////////////////////////////
// Event handler setup
///////////////////////////////////////////////////////////////////////////////


function genLabel ($labelCont, txt) {

    var res = $('<span>')
        .addClass('graph-label')
        .css('display', 'none')
        .text(txt)
        .on('mouseover', function () {
            $(this).addClass('on');
        })
        .on('mouseout', function () {
            $(this).removeClass('on');
        });

    $labelCont.append(res);

    return res;
}

// $DOM * RendererState  -> ()
// Immediately reposition each label based on camera and curPoints buffer
var renderLabelsRan = false;
function renderLabels($labelCont, renderState) {

    debug('rendering labels');

    var curPoints = renderState.get('hostBuffers').curPoints;
    if (!curPoints) {
        console.warn('renderLabels called before curPoints available');
        return;
    }

    curPoints.take(1).subscribe(function (curPoints) {
        renderLabelsImmediate($labelCont, renderState, curPoints);
    });
}


//RenderState * [ float ] * int -> ()
function renderCursor (renderState, points, idx) {

    debug('Enlarging current mouseover point', idx);

    if (idx <= 0) {
        return;
    }

    var camera = renderState.get('camera');
    var cnv = $('#simulation').get(0);
    var mtx = camera.getMatrix();

    var pos = camera.canvasCoords(points[2 * idx], -points[2 * idx + 1], 1, cnv, mtx);

    $('#highlighted-point-cont').css({
        top: pos.y,
        left: pos.x
    });

}





function newLabelPositions(renderState, labels, points) {

    var camera = renderState.get('camera');
    var cnv = $('#simulation').get(0);
    var mtx = camera.getMatrix();

    var newPos = new Float32Array(labels.length * 2);
    for (var i = 0; i < labels.length; i++) {
        var idx = labels[i].idx;
        var pos = camera.canvasCoords(points[2 * idx], -points[2 * idx + 1], 1, cnv, mtx);
        newPos[2 * i] = pos.x;
        newPos[2 * i + 1] = pos.y;
    }

    return newPos;
}

function effectLabels(toClear, toShow, labels, newPos) {

        //DOM effects
    toClear.forEach(function (lbl) {
        lbl.elt.css('display','none');
    });
    toShow.forEach(function (lbl) {
        lbl.elt.css('display', 'block');
    });

    labels.forEach(function (elt, i) {
        elt.elt.css('left', newPos[2 * i]).css('top', newPos[2 * i + 1]);
    });

}

function renderLabelsImmediate ($labelCont, renderState, curPoints) {

    var points = new Float32Array(curPoints.buffer);

    if (!renderLabelsRan) {
        renderLabelsRan = true;
        var allOn = renderer.localAttributeProxy(renderState)('allHighlighted');
        var amt = curPoints.buffer.byteLength / (4 * 2);
        for (var i = 0; i < amt; i++) {
            allOn.write(i, HIGHLIGHT_SIZE);
        }
    }

    var t0 = Date.now();

    var hits = poi.getActiveApprox(renderState, 'pointHitmapDownsampled');

    var t1 = Date.now();

    var toClear = poi.finishApprox(poi.state.activeLabels, poi.state.inactiveLabels, hits, renderState, points);

    //select label elts (and make active if needed)
    var toShow = [];
    var labels = _.keys(hits)
        .map(function (idx) {
            if (poi.state.activeLabels[idx]) {
                return poi.state.activeLabels[idx];
            } else {
                if (!poi.state.inactiveLabels.length) {
                    return {
                        idx: idx,
                        elt:  genLabel($labelCont, idx)
                    };
                }
                var lbl = poi.state.inactiveLabels.pop();
                lbl.idx = idx;
                lbl.elt.text(idx);
                toShow.push(lbl);
                return lbl;
            }
        })
        .filter(_.identity);

    poi.resetActiveLabels(_.object(labels.map(function (lbl) { return [lbl.idx, lbl]; })));

    var t2 = Date.now();

    var newPos = newLabelPositions(renderState, labels, points, toClear, toShow);

    var t3 = Date.now();

    effectLabels(toClear, toShow, labels, newPos);

    debug('sampling timing', t1 - t0, t2 - t1, t3 - t2, Date.now() - t3,
        'labels:', labels.length, '/', _.keys(hits).length, poi.state.inactiveLabels.length);

}


//render most of scene on refresh, but defer slow hitmap (readPixels)
var lastRender = new Rx.Subject();
function renderScene(renderer, currentState, points, highlightIdx) {
    lastRender.onNext({renderer: renderer, currentState: currentState, points: points, highlightIdx: highlightIdx});
}

var reqAnimationFrame =
        window.requestAnimationFrame       ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame    ||
        window.oRequestAnimationFrame      ||
        window.msRequestAnimationFrame     ||
        function (f) { setTimeout(f, 1000 / 60); };

//Render gpu items, text on reqAnimFrame
//Slower, update the pointpicking sampler (does GPU->CPU transfer)
var lastRenderTime = 0;
var mostRecent = null;
lastRender
    .do(function (cfg) {
        mostRecent = cfg;
        reqAnimationFrame(function (t) {
            if (!mostRecent || t === lastRenderTime) {
                return;
            }
            lastRenderTime = t;

            var cfg = mostRecent;

            var items = cfg.currentState.get('config').get('scene').get('render').toJS()
                .filter(function (v) { return v !== 'pointpicking'; });
            cfg.renderer.render(cfg.currentState, items);
            renderCursor(cfg.currentState, new Float32Array(cfg.points.buffer), cfg.highlightIdx);
        });
    })
    .sample(100).subscribe(
        function (cfg) { cfg.renderer.render(cfg.currentState, ['pointpicking']); },
        function (err) { console.error('Error handling mouse', err, err.stack); });


function setupInteractions($eventTarget, renderState) {
    var currentState = renderState;
    var camera = renderState.get('camera');

    var $labelCont = $('<div>').addClass('graph-label-container');
    $eventTarget.append($labelCont);
    var labels = _.range(1,10).map(function (i) {
        return genLabel($labelCont, i);
    });
    labels.forEach(function ($lbl, i) {
        var cont = {idx: i, elt: $lbl};
        poi.state.inactiveLabels.push(cont);
    });

    Rx.Observable.combineLatest(
            currentState.get('hostBuffers').curPoints,
            currentState.get('rendered').filter(function (items) {
                return items && (items.indexOf('pointsampling') > -1);
            }),
            _.identity)
        .subscribe(function () {
            renderLabels($labelCont, currentState);
        });


    //pan/zoom
    //Observable Event
    var interactions;
    if(interaction.isTouchBased) {
        debug('Detected touch-based device. Setting up touch interaction event handlers.');
        var eventTarget = $eventTarget[0];
        interactions = interaction.setupSwipe(eventTarget, camera)
            .merge(interaction.setupPinch($eventTarget, camera));
    } else {
        debug('Detected mouse-based device. Setting up mouse interaction event handlers.');
        interactions = interaction.setupDrag($eventTarget, camera)
            .merge(interaction.setupScroll($eventTarget, camera));
    }


    //Observable int
    var latestHighlightedPoint = new Rx.ReplaySubject(1);
    interaction.setupMousemove($eventTarget, currentState, 'pointHitmap')
            .sample(10)
            .filter(function (v) { return v > -1; })
            .subscribe(latestHighlightedPoint);

    //render scene on pan/zoom (get latest points etc. at that time)
    interactions
        .flatMapLatest(function (camera) {
            return Rx.Observable.combineLatest(
                latestHighlightedPoint,
                renderState.get('hostBuffers').curPoints,
                function (idx, curPoints) {
                    return _.extend({}, {idx: idx, camera: camera, curPoints: curPoints});
                })
                .take(1);
        })
        .subscribe(function(data) {
            currentState = renderer.setCameraIm(renderState, data.camera);
            renderScene(renderer, currentState, data.curPoints, data.idx);
        });

    //change highlighted label on mouseover
    latestHighlightedPoint
        .scan(
            {prevIdx: -1, curIdx: -1},
            function (acc, idx) { return {prevIdx: acc.curIdx, curIdx: idx}; })
        .filter(function (prevCur) {
            debug('Point hitmap got index:', prevCur.curIdx);
            return prevCur.prevIdx !== prevCur.curIdx;
        })
        .flatMap(function (data) {
            return renderState.get('hostBuffers').curPoints
                .take(1)
                .map(function (curPoints) {
                    return _.extend({}, data, {curPoints: curPoints});
                });
        })
        .subscribe(function (prevCur) {

            debug('Hitmap detected mouseover on a new point with index', prevCur.curIdx);

            var idx = prevCur.curIdx;
            var curPoints = prevCur.curPoints;

            var points = new Float32Array(curPoints.buffer);

            var xtra = idx > -1 ? (' (' + points[2*idx].toFixed(3) + ', ' + points[2*idx+1].toFixed(3) + ')') : '';
            var lblText = (idx > -1 ? '#' + idx.toString(16) : '') + xtra;
            $('.hit-label').text('Location ID: ' + lblText);

            if (idx > -1) {
                renderCursor(renderState, new Float32Array(points.buffer), idx);
            }
        },
        function (err) { console.error('mouse move err', err, err.stack); });

}



function init(socket, $elt, renderState) {

    setupInteractions($elt, renderState);

    //trigger animation on server
    socket.emit('graph_settings', {});

    //TODO try/catch because sc.html does not have tooltip
    try {
        $('#refresh')
            .tooltip()
            .on('click', function () {
                debug('reset_graph');

                socket.emit('reset_graph', {}, function () {
                    debug('page refresh');
                    window.location.reload();
                });
            });
    } catch (e) { }

    var elts = {
        nodeSlider: 'charge',
        edgeStrengthSlider: 'edgeStrength',
        edgeDistSlider: 'edgeDistance',
        gravitySlider: 'gravity'
    };

    window.$OLD('#timeSlider').rangeSlider({
         bounds: {min: 0, max: 100},
         arrows: false,
         defaultValues: {min: 30, max: 40},
         valueLabels: 'hide', //show, change, hide
         wheelMode: 'zoom'
      });


    var timeSlide = new Rx.Subject();
    //FIXME: replace $OLD w/ browserfied jquery+jqrangeslider
    window.$OLD('#timeSlider').on('valuesChanging', function (e, data) {
        timeSlide.onNext({min: data.values.min, max: data.values.max});
    });
    timeSlide.sample(3).subscribe(function (when) {
        socket.emit('graph_settings', {timeSubset: {min: when.min, max: when.max}});
    });


    $('.menu-slider').each(function () {
        var slider = new Slider(this);
        var name = elts[this.id];

        var slide = Rx.Observable.fromEventPattern(
            function(h) { slider.on('slide', h); },
            function() { /* No 'off' fn in bootstrap-slider */ return; });

        //send to server
        slide
            .distinctUntilChanged()
            .sample(10)
            .merge(Rx.Observable.just(0))   // Send the current value on load
            .map(function() {
                return slider.getValue() / 1000;
            })
            .subscribe(function (val) {
                sendSetting(socket, name, val);
            }, function (err) {
                console.error('nooo', err);
            });
    });
}


module.exports = init;
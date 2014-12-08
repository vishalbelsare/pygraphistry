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


function makeErrorHandler(name) {
    return function (err) {
        console.error(name, err, (err || {}).stack);
    };
}


///////////////////////////////////////////////////////////////////////////////
// Event handler setup
///////////////////////////////////////////////////////////////////////////////

//Observable DOM
var labelHover = new Rx.Subject();

//create label, attach to dom, and on hover, notify labelHover
function genLabel ($labelCont, txt) {

    var res = $('<div>')
        .addClass('graph-label')
        .css('display', 'none')
        .empty()
        .append(txt)
        .on('mouseover', function () {
            labelHover.onNext(this);
        });

    $labelCont.append(res);

    return res;
}

// $DOM * RendererState  -> ()
// Immediately reposition each label based on camera and curPoints buffer
var renderLabelsRan = false;
function renderLabels($labelCont, renderState, labelIdx) {

    debug('rendering labels');

    var curPoints = renderState.get('hostBuffers').curPoints;
    if (!curPoints) {
        console.warn('renderLabels called before curPoints available');
        return;
    }

    curPoints.take(1)
        .do(function (curPoints) {

            //first run: created the enlarged points for the sampler
            if (!renderLabelsRan) {
                renderLabelsRan = true;
                var allOn = renderer.localAttributeProxy(renderState)('allHighlighted');
                var amt = curPoints.buffer.byteLength / (4 * 2);
                for (var i = 0; i < amt; i++) {
                    allOn.write(i, HIGHLIGHT_SIZE);
                }
            }

            renderLabelsImmediate($labelCont, renderState, curPoints, labelIdx);

        })
        .subscribe(_.identity, makeErrorHandler('renderLabels'));
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

function effectLabels(toClear, toShow, labels, newPos, labelIdx) {

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

function renderLabelsImmediate ($labelCont, renderState, curPoints, labelIdx) {

    var points = new Float32Array(curPoints.buffer);

    var t0 = Date.now();

    var hits = poi.getActiveApprox(renderState, 'pointHitmapDownsampled');
    if (labelIdx > -1) {
        hits[labelIdx] = true;
    }
    var t1 = Date.now();

    var toClear = poi.finishApprox(poi.state.activeLabels, poi.state.inactiveLabels, hits, renderState, points);

    //select label elts (and make active if needed)
    var toShow = [];
    var labels = _.keys(hits)
        .map(function (idx) {
            if (poi.state.activeLabels[idx]) {
                return poi.state.activeLabels[idx];
            } else {

                var points = new Float32Array(curPoints.buffer);
                var lblText = ' (' + points[2*idx].toFixed(3) + ', ' + points[2*idx+1].toFixed(3) + ')';

                var contents = $('<div>')
                                .append($('<span>').text(idx))
                                .append($('<hr>'))
                                .append($('<span>').text(lblText));

                if (!poi.state.inactiveLabels.length) {
                    return {
                        idx: parseInt(idx),
                        elt:  genLabel($labelCont, contents)
                    };
                }
                var lbl = poi.state.inactiveLabels.pop();
                lbl.idx = parseInt(idx);
                lbl.elt.empty().append(contents);
                toShow.push(lbl);
                return lbl;
            }
        })
        .filter(_.identity);

    poi.resetActiveLabels(_.object(labels.map(function (lbl) { return [lbl.idx, lbl]; })));

    var t2 = Date.now();

    var newPos = newLabelPositions(renderState, labels, points, toClear, toShow);

    var t3 = Date.now();

    effectLabels(toClear, toShow, labels, newPos, labelIdx);

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
    .sample(100)
    .do(function (cfg) {
        cfg.renderer.render(cfg.currentState, ['pointpicking']);
    })
    .subscribe(_.identity, makeErrorHandler('render effect'));


//move labels when camera moves or new highlight
//$DOM * Observable RenderState -> ()
function setupLabels ($labelCont, latestState, latestHighlightedPoint) {

    latestState
        .flatMapLatest(function (currentState) {
            //wait until has samples
            return currentState.get('rendered')
                .filter(function (items) { return items && (items.indexOf('pointsampling') > -1); })
                .flatMap(function () {
                    return latestHighlightedPoint.map(function (idx) {
                        return {idx: idx, currentState: currentState};
                    });
                });
        })
        .do(function (pair) {
            var currentState = pair.currentState;
            var idx = pair.idx;
            renderLabels($labelCont, currentState, idx);
        })
        .subscribe(_.identity, makeErrorHandler('setuplabels'));
}

//$DOM * RenderState -> Observable int
//Changes either from point mouseover or a label mouseover
function getLatestHighlightedPoint ($eventTarget, renderState, labelHover) {
    var res = new Rx.ReplaySubject(1);

    interaction.setupMousemove($eventTarget, renderState, 'pointHitmap')
        .filter(function (v) { return v > -1; })
        .merge(
            labelHover
                .map(function (elt) {
                    return _.values(poi.state.activeLabels)
                        .filter(function (lbl) { return lbl.elt.get(0) === elt; });
                })
                .filter(function (highlightedLabels) { return highlightedLabels.length; })
                .map(function (highlightedLabels) { return highlightedLabels[0].idx; }))
        .sample(10)
        .subscribe(res, makeErrorHandler('getLatestHighlightedPoint'));

    return res;
}

function setupInteractions($eventTarget, renderState) {
    //var currentState = renderState;

    var stateStream = new Rx.Subject();
    var latestState = new Rx.ReplaySubject(1);
    stateStream.subscribe(latestState);
    stateStream.onNext(renderState);

    var camera = renderState.get('camera');

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
    //Either from point mouseover or label mouseover
    var latestHighlightedPoint = getLatestHighlightedPoint($eventTarget, renderState, labelHover);

    var $labelCont = $('<div>').addClass('graph-label-container');
    $eventTarget.append($labelCont);
    setupLabels($labelCont, latestState, latestHighlightedPoint);


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
        .do(function(data) {
            var currentState = renderer.setCameraIm(renderState, data.camera);
            stateStream.onNext(currentState);
            renderScene(renderer, currentState, data.curPoints, data.idx);
        })
        .subscribe(_.identity, makeErrorHandler('render scene on pan/zoom'));

    //change highlighted point on hover, central label
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
        .do(function (prevCur) {

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
        })
        .subscribe(_.identity, makeErrorHandler('mouse move err'));

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
    timeSlide.sample(3)
        .do(function (when) {
            socket.emit('graph_settings', {timeSubset: {min: when.min, max: when.max}});
        })
        .subscribe(_.identity, makeErrorHandler('timeSlide'));


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
            .do(function (val) {
                sendSetting(socket, name, val);
            })
            .subscribe(_.identity, makeErrorHandler('menu slider'));
    });
}


module.exports = init;
'use strict';

var debug = require('debug')('graphistry:StreamGL:marquee');
var $     = window.$;
var Rx    = require('rx');
            require('../rx-jquery-stub');
var _     = require('underscore');
var renderer = require('../renderer.js');
var util     = require('./util.js');



//$DOM * evt -> {x: num, y: num}
function toPoint ($cont, evt) {
    var offset = $cont.offset();
    return {x: evt.pageX - offset.left, y: evt.pageY - offset.top};
}

//{x: num, y: num} * {x: num, y: num} -> {tl: {x: num, y:num}, br: {x: num, y:num}}
function toRect (pointA, pointB) {
    var left    = Math.min(pointA.x, pointB.x);
    var right   = Math.max(pointA.x, pointB.x);

    var top     = Math.min(pointA.y, pointB.y);
    var bottom  = Math.max(pointA.y, pointB.y);

    var pos = {
        tl: {x: left, y: top},
        br: {x: right, y: bottom}
    };
    return pos;
}

//$DOM * Observable bool -> ()
//Add/remove 'on'/'off' class
function maintainContainerStyle($cont, isOn) {
     isOn.subscribe(
        function (isOn) {
            debug('marquee toggle', isOn);
            if (isOn) {
                $cont.removeClass('off').addClass('on');
            } else {
                $cont.removeClass('on') .addClass('off');
            }
        },
        util.makeErrorHandler('$cont on/off'));
}


function effectCanvas(effect) {
    if (effect === 'blur') {
        $('#simulation').css({
            'filter': 'grayscale(50%) blur(2px)',
            '-webkit-filter': 'grayscale(50%) blur(2px)',
        });
    } else if (effect === 'clear') {
        $('#simulation').css({
            'filter': '',
            '-webkit-filter': '',
        });
    } else {
        console.error('effectCanvas: unknown effect', effect);
    }
}

//$DOM * $DOM * Observable bool * bool * Function -> Observable_1 {top, left, width, height}
//track selections and affect $elt style/class
//
// doAfterSelection takes (appState, rect, $elt, width, height)
//
function marqueeSelections (appState, $cont, $elt, isOn, doAfterSelection) {
    var bounds = isOn.flatMapLatest(function (isOn) {
            if (!isOn) {
                debug('stop listening for marquee selections');
                $('#simulation').css({
                    'filter': '',
                    '-webkit-filter': '',
                });
                effectCanvas('clear');
                return Rx.Observable.empty();
            } else {
                debug('start listening for marquee selections');
                var firstRunSinceMousedown;
                return Rx.Observable.fromEvent($cont, 'mousedown')
                    .do(function (evt) {
                        debug('stopPropagation: marquee down');
                        appState.marqueeOn.onNext('selecting');
                        evt.stopPropagation();
                        $('body').addClass('noselect');
                        effectCanvas('clear');
                        $elt.empty();
                        $elt.css({width: 0, height: 0});
                        $elt.removeClass('draggable').removeClass('dragging');
                        $cont.removeClass('done');
                    }).map(toPoint.bind('', $cont))
                    .do(function () {
                            debug('marquee instance started, listening');
                            firstRunSinceMousedown = true;
                    }).flatMapLatest(function (startPoint) {
                        return Rx.Observable.fromEvent($(window.document), 'mousemove')
                            .do(function (evt) {
                                debug('stopPropagation: marquee move');
                                evt.stopPropagation();
                            })
                            .sample(1)
                            .map(function (moveEvt) {
                                return toRect(startPoint, toPoint($cont, moveEvt));
                            }).do(function (rect) {
                                if (firstRunSinceMousedown) {
                                    debug('show marquee instance on first bound calc');
                                    $elt.removeClass('off').addClass('on');
                                    firstRunSinceMousedown = false;
                                }
                                $elt.css({
                                    left: rect.tl.x,
                                    top: rect.tl.y,
                                    width: rect.br.x - rect.tl.x,
                                    height: rect.br.y - rect.tl.y
                                });
                            }).takeUntil(Rx.Observable.fromEvent($(window.document), 'mouseup')
                                .do(function (evt) {
                                    debug('stopPropagation: marquee up');
                                    evt.stopPropagation();
                                    debug('drag marquee finished');
                                })
                            ).takeLast(1)
                            .do(function (rect) {
                                $('body').removeClass('noselect');
                                $elt.addClass('draggable').removeClass('on');
                                $cont.addClass('done');
                                appState.marqueeOn.onNext('done');

                                var width = rect.br.x - rect.tl.x;
                                var height = rect.br.y - rect.tl.y;
                                var bw = parseInt($elt.css('border-width'));

                                $elt.css({ // Take border sizes into account when aligning ghost image
                                    left: rect.tl.x - bw,
                                    top: rect.tl.y - bw,
                                    width: width + 2 * bw,
                                    height: height + 2 * bw
                                });

                                doAfterSelection(appState, rect, $elt, width, height);

                            });
                    });

            }
        });

    return bounds;
}

function blurAndMakeGhost(appState, rect, $elt, width, height) {
    effectCanvas('blur');
    createGhostImg(appState.renderState, rect, $elt, width, height);
}

function toDelta(startPoint, endPoint) {
    return {x: endPoint.x - startPoint.x,
            y: endPoint.y - startPoint.y};
}


function clearMarquee($cont, $elt) {
    $elt.removeClass('dragging').addClass('off');
    $cont.removeClass('done beingdragged');
    $('body').removeClass('noselect');
    effectCanvas('clear');
}

function marqueeDrags(selections, $cont, $elt, appState) {
    var drags = selections.flatMapLatest(function (selection) {
        var firstRunSinceMousedown = true;
        return Rx.Observable.fromEvent($elt, 'mousedown')
            .do(function (evt) {
                debug('stopPropagation: marquee down 2');
                appState.marqueeOn.onNext('dragging');
                evt.stopPropagation();
                $('body').addClass('noselect');
                $cont.addClass('beingdragged');
            })
            .map(toPoint.bind('', $cont))
            .flatMapLatest(function (startPoint) {
                debug('Start of drag: ', startPoint);
                return Rx.Observable.fromEvent($(window.document), 'mousemove')
                    .do(function (evt) {
                        debug('stopPropagation: marquee move 2');
                        evt.stopPropagation();
                    })
                    .sample(1)
                    .map(function (evt) {
                        return {start: startPoint, end: toPoint($cont, evt)};
                    }).do(function (drag) {
                        var delta = toDelta(drag.start, drag.end);

                        // Side effects
                        if (firstRunSinceMousedown) {
                            firstRunSinceMousedown = false;
                            $elt.removeClass('draggable').addClass('dragging');
                        }
                        $elt.css({
                            left: selection.tl.x + delta.x,
                            top: selection.tl.y + delta.y
                        });
                    }).takeUntil(Rx.Observable.fromEvent($(window.document), 'mouseup')
                        .do(function () {
                            debug('End of drag');
                            appState.marqueeOn.onNext('toggle');
                            clearMarquee($cont, $elt);
                        })
                    ).takeLast(1);
            });
    });

    var dragsA = new Rx.ReplaySubject(1);
    drags.subscribe(dragsA, util.makeErrorHandler('dragsA'));
    return dragsA;
}

function brushDrags(selections, $cont, $elt, doneDragging, appState) {
    var drags = selections.flatMapLatest(function (selection) {
        var firstRunSinceMousedown = true;
        var dragDelta = {x: 0, y: 0};
        return Rx.Observable.fromEvent($elt, 'mousedown')
            .do(function (evt) {
                debug('stopPropagation: marquee down 2');
                appState.brushOn.onNext('dragging');
                evt.stopPropagation();
                $('body').addClass('noselect');
                $cont.addClass('beingdragged');
            })
            .map(toPoint.bind('', $cont))
            .flatMapLatest(function (startPoint) {
                debug('Start of drag: ', startPoint);
                return Rx.Observable.fromEvent($(window.document), 'mousemove')
                    .do(function (evt) {
                        debug('stopPropagation: marquee move 2');
                        evt.stopPropagation();
                    })
                    .sample(1)
                    .map(function (evt) {
                        return {start: startPoint, end: toPoint($cont, evt)};
                    }).do(function (drag) {
                        dragDelta = toDelta(drag.start, drag.end);

                        // Side effects
                        if (firstRunSinceMousedown) {
                            firstRunSinceMousedown = false;
                            $elt.removeClass('draggable').addClass('dragging');
                        }
                        $elt.css({
                            left: selection.tl.x + dragDelta.x,
                            top: selection.tl.y + dragDelta.y
                        });

                    }).map(function () {
                        // Convert back into TL/BR
                        var newTl = {x: selection.tl.x + dragDelta.x,
                                y: selection.tl.y + dragDelta.y};
                        var newBr = {x: selection.br.x + dragDelta.x,
                                y: selection.br.y + dragDelta.y};

                        return {tl: newTl, br: newBr};
                    }).takeUntil(Rx.Observable.fromEvent($(window.document), 'mouseup')
                        .do(function () {
                            debug('End of drag');
                            appState.brushOn.onNext('done');
                            // clearMarquee($cont, $elt);

                            // Update Selection positions.
                            selection.tl.x += dragDelta.x;
                            selection.tl.y += dragDelta.y;
                            selection.br.x += dragDelta.x;
                            selection.br.y += dragDelta.y;

                            var newTl = {x: selection.tl.x,
                                y: selection.tl.y};
                            var newBr = {x: selection.br.x,
                                y: selection.br.y};

                            doneDragging.onNext({tl: newTl, br: newBr});
                        })
                    );
            });
    });
    return drags;
}


function createElt() {

    return $('<div>')
        .addClass('selection')
        .addClass('off');

}

// Callback takes texture as arg.
// TODO: Consider using RX here instead of callbacks?
function getTexture(renderState, dims, cb) {
    renderer.render(renderState, 'marqueeGetTexture', 'marquee', undefined, dims, function () {
            var texture = renderState.get('pixelreads').pointTexture;
            if (!texture) {
                console.error('error reading texture');
            }
            cb(texture);
        });
}


function createGhostImg(renderState, sel, $elt, cssWidth, cssHeight) {
    var canvas = renderState.get('gl').canvas;
    var pixelRatio = renderState.get('camera').pixelRatio;

    var dims = {
        x: sel.tl.x * pixelRatio,
        y: canvas.height - pixelRatio * (sel.tl.y + Math.abs(sel.tl.y - sel.br.y)), // Flip y coordinate
        width: Math.max(1, pixelRatio * Math.abs(sel.tl.x - sel.br.x)),
        height: Math.max(1, pixelRatio * Math.abs(sel.tl.y - sel.br.y))
    };

    getTexture(renderState, dims, function (texture) {
        var imgCanvas = document.createElement('canvas');
        imgCanvas.width = dims.width;
        imgCanvas.height = dims.height;
        var ctx = imgCanvas.getContext('2d');

        var imgData = ctx.createImageData(dims.width, dims.height);
        imgData.data.set(texture);
        ctx.putImageData(imgData, 0, 0);
        var img = new Image();
        img.src = imgCanvas.toDataURL();

        $(img).css({
            'pointer-events': 'none',
            'transform': 'scaleY(-1)',
            'width': cssWidth,
            'height': cssHeight
        });
        $elt.append(img);
    });
}


function initBrush (appState, $cont, toggle, cfg) {

    debug('init brush');

    cfg = cfg || {};
    cfg.transform = cfg.transform || _.identity;
    var $elt = createElt();

    //starts false
    var isOn = new Rx.ReplaySubject(1);
    toggle.merge(Rx.Observable.return(false)).subscribe(isOn, util.makeErrorHandler('on/off'));

    isOn.subscribe(function (flag) {
        if (!flag) {
            clearMarquee($cont, $elt);
        }
    }, util.makeErrorHandler('blur canvas'));

    //Effect scene
    $cont.append($elt);
    maintainContainerStyle($cont, isOn);

    var transformAll = function(obj) {
        return _.object(_.map(obj, function (val, key) {
            return [key, cfg.transform(val)];
        }));
    };

    var doneDraggingRaw = new Rx.ReplaySubject(1);
    var doneDragging = doneDraggingRaw.debounce(50).map(transformAll);

    var bounds = marqueeSelections(appState, $cont, $elt, isOn, _.identity);
    var drags = brushDrags(bounds, $cont, $elt, doneDraggingRaw, appState).map(transformAll);
    var selections = bounds.map(transformAll);

    return {
        selections: selections,
        bounds: bounds,
        drags: drags,
        doneDragging: doneDragging,
        $elt: $elt,
        isOn: toggle
    };

}


// AppState * $DOM * Observable bool * ?{?transform: [num, num] -> [num, num]}
//          -> {selections: Observable [ [num, num] ] }
function initMarquee (appState, $cont, toggle, cfg) {
    debug('init marquee');

    cfg = cfg || {};
    cfg.transform = cfg.transform || _.identity;

    var $elt = createElt();

    //starts false
    var isOn = new Rx.ReplaySubject(1);
    toggle.merge(Rx.Observable.return(false)).subscribe(isOn, util.makeErrorHandler('on/off'));

    isOn.subscribe(function (flag) {
        if (!flag) {
            clearMarquee($cont, $elt);
        }
    }, util.makeErrorHandler('blur canvas'));

    //Effect scene
    $cont.append($elt);
    maintainContainerStyle($cont, isOn);

    var transformAll = function(obj) {
        return _.object(_.map(obj, function (val, key) {
            return [key, cfg.transform(val)];
        }));
    };
    var bounds = marqueeSelections(appState, $cont, $elt, isOn, blurAndMakeGhost);
    var boundsA = new Rx.ReplaySubject(1);
    bounds.subscribe(boundsA, util.makeErrorHandler('boundsA'));
    var drags = marqueeDrags(boundsA, $cont, $elt, appState).map(transformAll);
    var selections = boundsA.map(transformAll);

    return {
        selections: selections,
        bounds: boundsA,
        drags: drags,
        $elt: $elt,
        isOn: toggle
    };

}


module.exports = {
    initMarquee: initMarquee,
    initBrush: initBrush
};

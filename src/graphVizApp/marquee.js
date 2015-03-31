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

//$DOM * $DOM * Observable bool -> Observable_1 {top, left, width, height}
//track selections and affect $elt style/class
function marqueeSelections (renderState, $cont, $elt, isOn, appState) {
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
                        appState.marqueeActive.onNext(true);
                        appState.marqueeDone.onNext(false);
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
                                effectCanvas('blur');
                                $elt.addClass('draggable').removeClass('on');
                                $cont.addClass('done');
                                appState.marqueeActive.onNext(false);
                                appState.marqueeDone.onNext(true);

                                var width = rect.br.x - rect.tl.x;
                                var height = rect.br.y - rect.tl.y;
                                var bw = parseInt($elt.css('border-width'));

                                $elt.css({ // Take border sizes into account when aligning ghost image
                                    left: rect.tl.x - bw,
                                    top: rect.tl.y - bw,
                                    width: width + 2 * bw,
                                    height: height + 2 * bw
                                });

                                createGhostImg(renderState, rect, $elt, width, height);
                            });
                    });

            }
        });

    var boundsA = new Rx.ReplaySubject(1);
    bounds.subscribe(boundsA, util.makeErrorHandler('boundsA'));
    return boundsA;
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
                appState.marqueeActive.onNext(true);
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
                            appState.marqueeActive.onNext(false);
                            appState.marqueeDone.onNext(false);
                            clearMarquee($cont, $elt);
                        })
                    ).takeLast(1);
            });
    });

    var dragsA = new Rx.ReplaySubject(1);
    drags.subscribe(dragsA, util.makeErrorHandler('dragsA'));
    return dragsA;
}

function brushDrags(selections, $cont, $elt, appState) {
    var drags = selections.flatMapLatest(function (selection) {
        var firstRunSinceMousedown = true;
        return Rx.Observable.fromEvent($elt, 'mousedown')
            .do(function (evt) {
                debug('stopPropagation: marquee down 2');
                appState.marqueeActive.onNext(true);
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

                    }).map(function (drag) {
                        // Convert back into TL/BR
                        var delta = toDelta(drag.start, drag.end);
                        var newTl = {x: selection.tl.x + delta.x,
                                y: selection.tl.y + delta.y};
                        var newBr = {x: selection.br.x + delta.x,
                                y: selection.br.y + delta.y};

                        return {tl: newTl, br: newBr};
                    }).takeUntil(Rx.Observable.fromEvent($(window.document), 'mouseup')
                        .do(function () {
                            debug('End of drag');
                            appState.marqueeActive.onNext(false);
                            appState.marqueeDone.onNext(false);
                            clearMarquee($cont, $elt);
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
    var renderOpts = {renderListOverride: ['pointoutlinetexture', 'pointculledtexture'],
            readPixelsOverride: dims};

    renderer.render(renderState, 'marqueeGetTexture', function () {
            var texture = renderState.get('pixelreads').pointTexture;
            if (!texture) {
                console.error('error reading texture');
            }
            cb(texture);
        }, renderOpts);
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


function initBrush (renderState, $cont, toggle, appState, cfg) {

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
    var bounds = marqueeSelections(renderState, $cont, $elt, isOn, appState);
    var drags = brushDrags(bounds, $cont, $elt, appState).map(transformAll);
    var selections = bounds.map(transformAll);

    return {
        selections: selections,
        bounds: bounds,
        drags: drags,
        $elt: $elt,
        isOn: toggle
    };

}


//$DOM * Observable bool * ?{?transform: [num, num] -> [num, num]}
// -> {selections: Observable [ [num, num] ] }
function initMarquee (renderState, $cont, toggle, appState, cfg) {

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
    var bounds = marqueeSelections(renderState, $cont, $elt, isOn, appState);
    var drags = marqueeDrags(bounds, $cont, $elt, appState).map(transformAll);
    var selections = bounds.map(transformAll);

    return {
        selections: selections,
        bounds: bounds,
        drags: drags,
        $elt: $elt,
        isOn: toggle
    };

}


module.exports = {
    initMarquee: initMarquee,
    initBrush: initBrush
};

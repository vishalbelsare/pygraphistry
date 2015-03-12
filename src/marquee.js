'use strict';

var debug = require('debug')('graphistry:StreamGL:marquee');
var $     = window.$;
var Rx    = require('rx');
            require('./rx-jquery-stub');
var _     = require('underscore');
var renderer = require('./renderer.js');



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

function makeErrorHandler(name) {
    return function (err) {
        console.error(name, err, (err || {}).stack);
    };
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
        makeErrorHandler('$cont on/off'));
}

//$DOM * $DOM * Observable bool -> Observable_1 {top, left, width, height}
//track selections and affect $elt style/class
function marqueeSelections (renderState, $cont, $elt, isOn) {
    var bounds = isOn.flatMapLatest(function (isOn) {
            if (!isOn) {
                debug('stop listening for marquee selections');
                $('#simulation').css({
                    'filter': '',
                    '-webkit-filter': '',
                });
                return Rx.Observable.empty();
            } else {
                debug('start listening for marquee selections');
                var firstRunSinceMousedown;
                return Rx.Observable.fromEvent($cont, 'mousedown')
                    .do(function (evt) {
                        debug('stopPropagation: marquee down');
                        evt.stopPropagation();
                        $('body').addClass('noselect');
                        $('#simulation').css({
                            'filter': '',
                            '-webkit-filter': '',
                        });
                        $elt.empty();
                        $elt.css({width: 0, height: 0});
                        $elt.removeClass('draggable').removeClass('dragging').removeClass('done');
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
                                $('#simulation').css({
                                    'filter': 'grayscale(50%) blur(3px)',
                                    '-webkit-filter': 'grayscale(50%) blur(3px)',

                                });
                                $elt.addClass('draggable').removeClass('on').addClass('done');
                                $elt.css({ // Take border sizes into account when aligning ghost image
                                    left: rect.tl.x - 2,
                                    top: rect.tl.y - 2,
                                    width: rect.br.x - rect.tl.x + 4,
                                    height: rect.br.y - rect.tl.y + 4
                                });

                                var ghost = createGhostImg(renderState, rect);
                                $(ghost).css({
                                    'pointer-events': 'none',
                                    'transform': 'scaleY(-1)',
                                });
                                $elt.append(ghost);
                            });
                    });

            }
        });

    var boundsA = new Rx.ReplaySubject(1);
    bounds.subscribe(boundsA, makeErrorHandler('boundsA'));
    return boundsA;
}

function toDelta(startPoint, endPoint) {
    return {x: endPoint.x - startPoint.x,
            y: endPoint.y - startPoint.y};
}

function marqueeDrags(selections, $cont, $elt) {
    var drags = selections.flatMapLatest(function (selection) {
        var firstRunSinceMousedown = true;
        return Rx.Observable.fromEvent($elt, 'mousedown')
            .do(function (evt) {
                debug('stopPropagation: marquee down 2');
                evt.stopPropagation();
                $('body').addClass('noselect');
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
                            $elt.removeClass('dragging').removeClass('done').addClass('off');
                            $('body').removeClass('noselect');
                            $('#simulation').css({
                                'filter': '',
                                '-webkit-filter': '',
                            });
                        })
                    ).takeLast(1);
            });
    });

    var dragsA = new Rx.ReplaySubject(1);
    drags.subscribe(dragsA, makeErrorHandler('dragsA'));
    return dragsA;
}

function createElt() {

    return $('<div>')
        .addClass('selection')
        .addClass('off');

}


function getTexture(renderState, dims) {
    renderer.render(renderState, ['pointoutlinetexture', 'pointculledtexture'], dims);
    var texture = renderState.get('pixelreads').pointTexture;
    if (!texture) {
        console.error('error reading texture');
    }
    return texture;
}


function createGhostImg(renderState, sel) {
    var canvas = renderState.get('gl').canvas;

    var dims = {
        x: sel.tl.x,
        y: canvas.height - sel.tl.y - Math.abs(sel.tl.y - sel.br.y), // Flip y coordinate
        width: Math.max(1, Math.abs(sel.tl.x - sel.br.x)),
        height: Math.max(1, Math.abs(sel.tl.y - sel.br.y))
    };

    var texture = getTexture(renderState, dims);

    var imgCanvas = document.createElement('canvas');
    imgCanvas.width = dims.width;
    imgCanvas.height = dims.height;
    var ctx = imgCanvas.getContext('2d');

    var imgData = ctx.createImageData(dims.width, dims.height);
    imgData.data.set(texture);
    ctx.putImageData(imgData, 0, 0);
    var img = new Image();
    img.src = imgCanvas.toDataURL();

    return img;
}


//$DOM * Observable bool * ?{?transform: [num, num] -> [num, num]}
// -> {selections: Observable [ [num, num] ] }
function init (renderState, $cont, toggle, cfg) {

    debug('init marquee');

    cfg = cfg || {};
    cfg.transform = cfg.transform || _.identity;

    var $elt = createElt();

    //starts false
    var isOn = new Rx.ReplaySubject(1);
    toggle.merge(Rx.Observable.return(false)).subscribe(isOn, makeErrorHandler('on/off'));


    //Effect scene
    $cont.append($elt);
    maintainContainerStyle($cont, isOn);

    var transformAll = function(obj) {
        return _.object(_.map(obj, function (val, key) {
            return [key, cfg.transform(val)];
        }));
    };
    var bounds = marqueeSelections(renderState, $cont, $elt, isOn);
    var drags = marqueeDrags(bounds, $cont, $elt).map(transformAll);
    var selections = bounds.map(transformAll);

    return {
        selections: selections,
        bounds: bounds,
        drags: drags,
        $elt: $elt,
        isOn: toggle
    };

}


module.exports = init;

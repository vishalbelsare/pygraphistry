'use strict';

var debug = require('debug')('graphistry:StreamGL:marquee');
var Rx = require('rx');
var _ = require('underscore');
var $ = require('jquery');



//$DOM * evt -> {x: num, y: num}
function toPoint ($cont, evt) {
    var offset = $cont.offset();
    return {x: evt.pageX - offset.left, y: evt.pageY - offset.top};
}

//{x: num, y: num} * {x: num, y: num} -> {top,left,width,height}
function toRect (pointA, pointB) {
    var left    = Math.min(pointA.x, pointB.x);
    var right   = Math.max(pointA.x, pointB.x);

    var top     = Math.min(pointA.y, pointB.y);
    var bottom  = Math.max(pointA.y, pointB.y);
    var pos = {
        top:    top,
        left:   left,
        width:  right - left,
        height: bottom - top
    };
    debug('pos', pointA, pointB, pos);
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
function marqueeSelections ($cont, $elt, isOn) {

    var bounds = isOn.flatMapLatest(function (isOn) {
            if (!isOn) {
                debug('stop listening for marquee selections');
                return Rx.Observable.empty();
            } else {
                debug('start listening for marquee selections');
                var firstRunSinceMousedown;
                return Rx.Observable.fromEvent($cont, 'mousedown')
                        .do(function (evt) { evt.stopPropagation(); })
                    .map(toPoint.bind('', $cont))
                        .do(function () {
                            debug('marquee instance started, listening');
                            firstRunSinceMousedown = true; })
                    .flatMapLatest(function (startPoint) {
                        return Rx.Observable.fromEvent($cont, 'mousemove')
                                .do(function (evt) { evt.stopPropagation(); })
                            .sample(1)
                            .map(function (moveEvt) {
                                debug('dragging marquee (sampled)');
                                return toRect(startPoint, toPoint($cont, moveEvt));
                            })
                            .takeUntil(Rx.Observable.fromEvent($cont, 'mouseup')
                                .do(function (evt) { evt.stopPropagation(); })
                                .do(function () {
                                    debug('drag marquee finished, ending instance & hiding');
                                    $elt.removeClass('on').addClass('off');
                                }));
                    })
                    .do(function (rect) {
                        if (firstRunSinceMousedown) {
                            debug('show marquee instance on first bound calc');
                            $elt.removeClass('off').addClass('on');
                            firstRunSinceMousedown = false;
                        }
                        debug('moving marquee');
                        $elt.css(rect);
                    });
            }
        });

    var boundsB = new Rx.ReplaySubject(1);
    bounds.subscribe(boundsB, makeErrorHandler('boundsB'));

    return boundsB;
}

function createElt() {

    return $('<div>')
        .addClass('selection')
        .addClass('off');

}


//$DOM * Observable bool * ?{?transform: [num, num] -> [num, num]}
// -> {selections: Observable [ [num, num] ] }
function init ($cont, toggle, cfg) {

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
    var bounds = marqueeSelections($cont, $elt, isOn);

    return {
        selections: bounds,
        $elt: $elt
    };

}


module.exports = init;
'use strict';

/* global $$ */

var $        = require('jquery');
var Rx       = require('rx');
               require('./rx-jquery-stub');
var debug    = require('debug')('graphistry:StreamGL:interaction');
var renderer = require('./renderer');


///////////////////////////////////////////////////////////////////////////////
// Mouse event handlers
///////////////////////////////////////////////////////////////////////////////


/**
 * Adds event listeners for drag events and changes the local camera position in response.
 *
 * @param  {jQuery object} $eventTarget - The jQuery object which wraps the DOM element to detect
 *                                        drag events on.
 * @param  {Camera} camera              - The camera object to update based off of drag events.
 *
 * @return {Rx.Observable} Rx stream with Camera objects for every drag event.
 */
function setupDrag($eventTarget, camera) {
    return $eventTarget.mousedownAsObservable()
        .flatMapLatest(function(clickPos) {
            clickPos.preventDefault();

            return $('html').mousemoveAsObservable()
                .takeUntil($('html').mouseupAsObservable())
                .distinctUntilChanged(function(pos) { return {x: pos.pageX, y: pos.pageY}; })
                .scan({x: clickPos.pageX, y: clickPos.pageY, deltaX: 0, deltaY: 0}, function(accPos, curPos) {
                    // Calculate the distance moved (since last event) for each move event
                    return {
                        deltaX: (curPos.pageX - accPos.x) / $eventTarget.width(),
                        deltaY: (curPos.pageY - accPos.y) / $eventTarget.height(),
                        x: curPos.pageX,
                        y: curPos.pageY
                    };
                })
                .map(function(dragEvent) {
                    camera.center.x -= dragEvent.deltaX * camera.width ;
                    camera.center.y -= dragEvent.deltaY * camera.height;
                    return camera;
                });
        });
}


function setupMousemove($eventTarget, renderState, texture) {
    debug('setupMouseover');
    var bounds = $('canvas', $eventTarget[0])[0].getBoundingClientRect();

    return $eventTarget.mousemoveAsObservable()
        .sample(5)
        .map(function (evt) {
            evt.preventDefault();
            var pos = {
                x: evt.clientX - bounds.left,
                y: evt.clientY - bounds.top
            };
            return renderer.hitTest(renderState, texture, pos.x, pos.y, 20);
        });
}

function setupScroll($eventTarget, canvas, camera) {
    var zoomBase = 1.1;

    return $eventTarget.onAsObservable('mousewheel')
        .do(function (wheelEvent) {
            wheelEvent.preventDefault();
        })
        .sample(1)
        .map(function(wheelEvent) {
            var bounds = $eventTarget[0].getBoundingClientRect();
            var zoomFactor = (wheelEvent.deltaY < 0 ? zoomBase : 1.0 / zoomBase) || 1.0;

            var canvasPos = {
                x: (wheelEvent.clientX - bounds.left),
                y: (wheelEvent.clientY - bounds.top)
            };

            var screenPos = camera.canvas2ScreenCoords(canvasPos.x, canvasPos.y, canvas);
            debug('Mouse screen pos=(%f,%f)', screenPos.x, screenPos.y);

            var xoffset = screenPos.x - camera.center.x;
            var yoffset = screenPos.y - camera.center.y;
            camera.center.x += xoffset * (1.0 - zoomFactor);
            camera.center.y += yoffset * (1.0 - zoomFactor);
            camera.width = camera.width * zoomFactor;
            camera.height = camera.height * zoomFactor;

            debug('New Camera center=(%f, %f) size=(%f , %f)',
                  camera.center.x, camera.center.y, camera.width, camera.height);
            return camera;
        });
}


function setupCenter($toggle, curPoints, camera) {
    return $toggle.onAsObservable('click')
        .sample(1)
        .flatMapLatest(function () {
            debug('click on center');
            return curPoints.take(1).map(function (curPoints) {
                var points = new Float32Array(curPoints.buffer);
                var bbox = {
                    left: Number.MAX_VALUE, right: Number.MIN_VALUE,
                    top: Number.MAX_VALUE, bottom: Number.MIN_VALUE
                };

                for (var i = 0; i < points.length; i+=2) {
                    var x = points[i];
                    var y = points[i+1];
                    bbox.left = x < bbox.left ? x : bbox.left;
                    bbox.right = x > bbox.right ? x : bbox.right;
                    bbox.top = y < bbox.top ? y : bbox.top;
                    bbox.bottom = y > bbox.bottom ? y : bbox.bottom;
                }

                debug('Bounding box: ', bbox);
                camera.centerOn(bbox.left, bbox.right, bbox.bottom * -1, bbox.top * -1);
                return camera;
            });
        });
}

///////////////////////////////////////////////////////////////////////////////
// Touch event handlers
///////////////////////////////////////////////////////////////////////////////


/**
 * Set a variable to detect if the device is touch based.
 */
var iOS = /(iPad|iPhone|iPod)/g.test( navigator.userAgent );
var touchBased = iOS;

/**
 * Helper function to compute distance for pinch-zoom
 */
function straightLineDist(p1, p2) {
    var dx = p1.x - p2.x;
    var dy = p1.y - p2.y;
    return Math.sqrt((dx*dx) + (dy*dy));
}


/**
 * Adds event listeners for swipe (zoom) and changes the local camera position in response.
 *
 * @param  {HTMLElement} eventTarget - The raw DOM element to detect swipe events on.
 * @param  {Camera} camera           - The camera object to update based off of swipe events.
 *
 * @return {Rx.Observable} Rx stream with Camera objects for every swipe event.
 */
function setupSwipe(eventTarget, camera) {
    var $$eventTarget = $$(eventTarget);

    return Rx.Observable.fromEvent($$eventTarget, 'swiping')
        .merge(Rx.Observable.fromEvent($$eventTarget, 'swipe')
            .map( function (ev) {ev.preventDefault(); return 0; }))

        .scan(0, function (acc, ev) {
            var data = {
                cam: camera,
                oldX: 0.0,
                oldY: 0.0,
                reset: false
            };

            if (ev === 0) {
                data.reset = true;
                return data;
            }

            ev.preventDefault();

            var duringPinch = Array.isArray(ev.originalEvent.currentTouch);
            if (duringPinch) {
                debug('Ignoring swipe event (drag event in progress)');

                if (acc) {
                    data.oldX = acc.oldX;
                    data.oldY = acc.oldY;
                    data.reset = true;
                }
                return data;
            }

            data.oldX = ev.originalEvent.currentTouch.x;
            data.oldY = ev.originalEvent.currentTouch.y;

            if (acc && !acc.reset) {
                var dx = (ev.originalEvent.currentTouch.x - acc.oldX) / $$eventTarget.width();
                var dy = (ev.originalEvent.currentTouch.y - acc.oldY) / $$eventTarget.height();

                camera.center.x -= dx * camera.width;
                camera.center.y -= dy * camera.height;
                data.cam = camera;
            }

            return data;

        })
        .map(function(data) {
            return data.cam;
        });
}


function setupPinch(eventTarget, camera) {
    var $$eventTarget = $$(eventTarget);

    return Rx.Observable.fromEvent($$eventTarget, 'pinching')
        .merge(Rx.Observable.fromEvent($$eventTarget, 'pinch')
            .map( function (ev) {ev.preventDefault(); return 0; }))

        .scan(0, function (acc, ev) {
            var data = {
                cam: camera,
                oldDist: -1,
                oldWidth: camera.width,
                oldHeight: camera.height
            };

            if (ev === 0) {
                return data;
            }
            ev.preventDefault();

            var curDist = straightLineDist(ev.originalEvent.currentTouch[0], ev.originalEvent.currentTouch[1]);
            data.oldDist = curDist;

            if (acc && acc.oldDist >= 0) {
                var aspectRatio = acc.oldWidth / acc.oldHeight;
                var scale = acc.oldDist / curDist;

                camera.width = acc.oldWidth * scale;
                camera.height = camera.width / aspectRatio;
                data.cam = camera;
            }
            return data;

        })
        .map(function(data) {
            return data.cam;
        });
}


module.exports = {
    setupDrag: setupDrag,
    setupMousemove: setupMousemove,
    setupScroll: setupScroll,
    setupCenter: setupCenter,
    setupSwipe: setupSwipe,
    setupPinch: setupPinch,

    isTouchBased: touchBased
};

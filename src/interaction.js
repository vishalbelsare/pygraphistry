'use strict';

var $        = require('jquery');
var _        = require('underscore');
var Rx       = require('rx');
var debug    = require('debug')('StreamGL:interaction');
var renderer = require('./renderer');

require('rx-jquery');


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
 * Adds event listeners for drag/zoom and changes the local camera position in response
 */
function setupDrag($eventTarget, camera) {
    if (touchBased) {
        var $$eventTarget = $$('.sim-container');

        return Rx.Observable.fromEvent($$eventTarget, 'swiping')
            .merge(Rx.Observable.fromEvent($$eventTarget, 'swipe')
                .map( function (ev) {ev.preventDefault(); return 0; }))

            .scan(0, function (acc, ev) {
                var data = {
                    cam: camera,
                    oldX: 0,
                    oldY: 0,
                    reset: false
                };

                if (ev === 0) {
                    data.reset = true;
                    return data;
                }

                ev.preventDefault();
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

    } else {
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
}


function setupMousemove($eventTarget, renderState, texture) {
    debug('setupMouseover');
    var bounds = $('canvas', $eventTarget[0])[0].getBoundingClientRect();

    return $eventTarget.mousemoveAsObservable()
        .sample(5)
        .map(function (evt) {
            var pos = {
                x: evt.clientX - bounds.left,
                y: evt.clientY - bounds.top
            };
            return renderer.hitTest(renderState, texture, pos.x, pos.y, 20);
        });
}


function setupScroll($eventTarget, camera) {
    if (touchBased) {
        var $$eventTarget = $$('.sim-container');
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

    } else {
        return Rx.Observable.fromEvent($eventTarget[0], 'mousewheel')
            .map(function(wheelEvent) {
                wheelEvent.preventDefault();

                var aspectRatio = camera.width / camera.height;
                var scrollY =
                    wheelEvent.wheelDeltaY ||
                    -wheelEvent.deltaY ||
                    (wheelEvent.originalEvent ?
                        (wheelEvent.originalEvent.wheelDeltaY || -wheelEvent.originalEvent.deltaY)
                        : 0)
                    | 0; //NaN protection

                camera.width -= camera.width * (scrollY / 100.0);
                camera.height = camera.width / aspectRatio;

                return camera;
            });
    }
}



function setup($eventTarget, renderState) {
    var currentState = renderState;
    var camera = renderState.get('camera');

    setupDrag($eventTarget, camera)
        .merge(setupScroll($eventTarget, camera))
        .subscribe(function(newCamera) {
            currentState = renderer.setCameraIm(renderState, newCamera);
            renderer.render(currentState);
        });

    var highlights = renderer.localAttributeProxy(renderState)('highlights');
    var prevIdx = -1;

    ['pointHitmap']
        .map(setupMousemove.bind(this, $eventTarget, currentState))
        .forEach(function(hits) {
            hits.sample(10)
                .filter(_.identity)
                .subscribe(function (idx) {
                    debug('got idx', idx);
                    if (idx !== prevIdx) {
                        $('.hit-label').text('Location ID: ' + (idx > -1 ? '#' + idx.toString(16) : ''));

                        var dirty = false;

                        if (idx > -1) {
                            debug('enlarging new point', idx);
                            highlights.write(idx, 20);
                            dirty = true;
                        }

                        if (prevIdx > -1) {
                            debug('shrinking old point', prevIdx);
                            highlights.write(prevIdx, 0);
                            dirty = true;
                        }

                        prevIdx = idx;
                        if (dirty) {
                            renderer.render(currentState);
                        }
                    }

                });
        });

    debug('Interaction setup complete');
}


exports.setup = setup;
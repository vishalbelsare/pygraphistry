'use strict';


import $ from 'jquery'
import { Observable, Subject } from 'rxjs';

var $$       = window.Quo;
var _        = require('underscore');
var debug    = require('debug')('graphistry:StreamGL:interaction');
var util     = require('./util.js');


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
 * @return {Observable} Rx stream with Camera objects for every drag event.
 */
function setupDrag($eventTarget, camera, appState) {
    var $sim = $('#simulation');
    var $html = $('html');

    return $eventTarget.mousedownAsObservable()
        .switchMap(util.observableFilter(appState.anyMarqueeOn, util.notIdentity))
        .filter(function (evt) {
            var $p = $(evt.target);

            //allow dragging by graph label title
            for (var i = 0; i < 2; i++) {
                if ($p.hasClass('graph-label')) {
                    return true;
                }
                $p = $p.parent();
            }

            for (var j = 0; j < 8; j++) {
                //allow dragging if not clicked
                if ($p.hasClass('graph-label')) {
                    return !$p.hasClass('clicked');
                }
                $p = $p.parent();
            }
            return true;
        })
        // Filter so that we don't do a camera pan interaction if we should
        // be moving points (dragging selected nodes)
        .switchMap((downEvt) => {
            return observableFilterForClickingSelectedPoints(downEvt, appState, false);
        })
        .do(function (/*clickPos*/) {
            // clickPos.preventDefault();
            $sim.toggleClass('moving', true);
        })
        .switchMap(function(clickPos) {
            return $('html').mousemoveAsObservable()
                .takeUntil($html.mouseupAsObservable()
                    .do(function () {
                        $sim.toggleClass('moving', false);
                    }))
                .distinctUntilChanged(function(a, b) {
                    return (a.x === b.x) && (a.y === b.y);
                }, function(pos) { return {x: pos.pageX, y: pos.pageY}; })
                .scan(function(accPos, curPos) {
                    // Calculate the distance moved (since last event) for each move event

                    // Use raw dom element to get height/width for perf reasons.
                    var rawTarget = $eventTarget[0];

                    return {
                        deltaX: (curPos.pageX - accPos.x) / rawTarget.offsetWidth,
                        deltaY: (curPos.pageY - accPos.y) / rawTarget.offsetHeight,
                        x: curPos.pageX,
                        y: curPos.pageY
                    };
                }, {x: clickPos.pageX, y: clickPos.pageY, deltaX: 0, deltaY: 0})
                .filter(function (dragEvent) {
                    return dragEvent.deltaX !== 0 || dragEvent.deltaY !== 0;
                })
                .map(function(dragEvent) {
                    camera.center.x -= dragEvent.deltaX * camera.width ;
                    camera.center.y -= dragEvent.deltaY * camera.height;
                    return camera;
                });
        });
}


function setupMousemove($eventTarget) {
    debug('setupMouseover');
    var bounds = $('canvas', $eventTarget[0])[0].getBoundingClientRect();

    var initial = {x: 0, y: 0};

    return $eventTarget.mousemoveAsObservable()
        .filter(function (v) {
            return ! $(v.target).parents('.graph-label.clicked').length;
        })
        .auditTime(1)
        .map(function (evt) {
            evt.preventDefault();
            return {
                x: evt.clientX - bounds.left,
                y: evt.clientY - bounds.top
            };
        })
        .merge(Observable.return(initial));
}


/*
    shift left/right: rotate
    shift up/down: tilt
*/
// Camera -> Observable Camera
// feature-gated by 3d
function setupRotate($eventTarget, camera) {

    var presses = new Subject();

    $eventTarget.keydown(function (e) { presses.onNext(e); });

    var CODES = {LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40};
    var AMT = 5;

    return presses
        .filter(function () { return camera.is3d; })
        .filter(function (e) { return !!e.shiftKey; })
        .do(function (e) {
             switch (e.keyCode || e.which) {
                case CODES.LEFT:
                    camera.rotation.z = (camera.rotation.z + AMT) % 360;
                    break;
                case CODES.UP:
                    camera.rotation.x = (camera.rotation.x + AMT) % 360;
                    break;
                case CODES.RIGHT:
                    camera.rotation.z = (camera.rotation.z - AMT) % 360;
                    break;
                case CODES.DOWN:
                    camera.rotation.x = (camera.rotation.x - AMT) % 360;
                    break;
            }
        })
        .map(_.constant(camera));
}


function setupScroll($eventTarget, canvas, camera, appState) {
    var zoomBase = 1.1;

    return $eventTarget.onAsObservable('mousewheel')
        .auditTime(1)
        .switchMap(util.observableFilter([appState.marqueeOn, appState.brushOn],
            function (val) {
                return val !== 'done';
            },
            util.AND
        ))
        .filter(function (evt) {
            return ! $(evt.target).parents('.graph-label-contents').length;
        })
        .do(function (wheelEvent) {
            wheelEvent.preventDefault();
        })
        .map(function({ originalEvent }) {
            var bounds = $eventTarget[0].getBoundingClientRect();
            var zoomFactor = (originalEvent.deltaY < 0 ? zoomBase : 1.0 / zoomBase) || 1.0;

            var canvasPos = {
                x: (originalEvent.clientX - bounds.left),
                y: (originalEvent.clientY - bounds.top)
            };

            var screenPos = camera.canvas2ScreenCoords(canvasPos.x, canvasPos.y, canvas);
            debug('Mouse screen pos=(%f,%f)', screenPos.x, screenPos.y);

            return zoom(camera, zoomFactor, screenPos);
        });
}

function setupZoomButton(toggleZoom, camera, zoomFactor) {
    return toggleZoom.map(function () {
        return zoom(camera, zoomFactor);
    });
}

// Camera * Float * {x : Float, y: Float}
// Zoom in/out on zoomPoint (specified in screen coordinates)
function zoom(camera, zoomFactor, zoomPoint) {
    var xoffset = 0;
    var yoffset = 0;
    if (zoomPoint !== undefined) {
        xoffset = zoomPoint.x - camera.center.x;
        yoffset = zoomPoint.y - camera.center.y;
    }

    camera.center.x += xoffset * (1.0 - zoomFactor);
    camera.center.y += yoffset * (1.0 - zoomFactor);
    camera.width = camera.width * zoomFactor;
    camera.height = camera.height * zoomFactor;

    debug('New Camera center=(%f, %f) size=(%f , %f)',
                  camera.center.x, camera.center.y, camera.width, camera.height);

    return camera;
}


function setupCenter(toggleCenter, curPoints, camera) {
    return toggleCenter
        .auditTime(1)
        .switchMap(function () {
            debug('click on center');
            return curPoints.take(1).map(function (curPoints) {
                var points = new Float32Array(curPoints.buffer);
                // Don't attempt to center when nothing is on screen
                if (points.length < 1) {
                    return camera;
                }
                const bbox = getBoundingBox(points);
                debug('Bounding box: ', bbox);
                const { top, left, right, bottom } = bbox;
                camera.centerOn(left, right, bottom * -1, top * -1);
                return camera;
            });
        });
}

function getBoundingBox(points) {

    const len = points.length;

    let index = -2,
        top = Number.MAX_VALUE, left = Number.MAX_VALUE,
        right = Number.MIN_VALUE, bottom = Number.MIN_VALUE;

    while ((index += 2) < len) {
        const x = points[index];
        const y = points[index + 1];
        top = y < top ? y : top;
        left = x < left ? x : left;
        right = x > right ? x : right;
        bottom = y > bottom ? y : bottom;
    }

    if (len === 1) {
        top -= 0.1;
        left -= 0.1;
        right += 0.1;
        bottom += 0.1;
    }

    return { top, left, right, bottom };
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
 * @return {Observable} Rx stream with Camera objects for every swipe event.
 */
function setupSwipe(eventTarget, camera) {
    var $$eventTarget = $$(eventTarget);

    return Observable.fromEvent($$eventTarget, 'swiping')
        .merge(Observable.fromEvent($$eventTarget, 'swipe')
            .map( function (ev) {ev.preventDefault(); return 0; }))

        .scan(function (acc, ev) {
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

        }, 0)
        .map(function(data) {
            return data.cam;
        });
}


function setupPinch(eventTarget, camera) {
    var $$eventTarget = $$(eventTarget);

    return Observable.fromEvent($$eventTarget, 'pinching')
        .merge(Observable.fromEvent($$eventTarget, 'pinch')
            .map( function (ev) {ev.preventDefault(); return 0; }))

        .scan(function (acc, ev) {
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

        }, 0)
        .map(function(data) {
            return data.cam;
        });
}

function observableFilterForClickingSelectedPoints (downEvt, appState, shouldBeSelected) {
    return appState.activeSelection
        .combineLatest(appState.latestHighlightedObject, (sel, highlighted) => {
            return {sel, highlighted};
        }).take(1)
        .filter(({sel, highlighted}) => {
            const highlightedPointIndices = highlighted.getPointIndexValues();

            let someHighlightedAreSelected = false;
            for (let i = 0; i < highlightedPointIndices.length; i++) {
                let pointIdx = highlightedPointIndices[i];
                someHighlightedAreSelected = someHighlightedAreSelected || sel.containsIndexByDim(pointIdx, 1);
            }

            if (shouldBeSelected) {
                return someHighlightedAreSelected;
            } else {
                return !someHighlightedAreSelected;
            }
        }).map(() => downEvt).take(1);
}


module.exports = {
    setupDrag: setupDrag,
    setupMousemove: setupMousemove,
    setupScroll: setupScroll,
    setupCenter: setupCenter,
    setupSwipe: setupSwipe,
    setupPinch: setupPinch,
    setupZoomButton: setupZoomButton,
    setupRotate: setupRotate,
    observableFilterForClickingSelectedPoints,

    isTouchBased: touchBased
};

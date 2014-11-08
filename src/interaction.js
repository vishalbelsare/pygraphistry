'use strict';

var $        = require('jquery');
var _        = require('underscore');
var Rx       = require('rx');
var debug    = require('debug')('StreamGL:interaction');
var renderer = require('./renderer');

require('rx-jquery');


/**
 * Adds event listeners for drag/zoom and changes the local camera position in response
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
            var pos = {
                x: evt.clientX - bounds.left,
                y: evt.clientY - bounds.top
            };
            return renderer.hitTest(renderState, texture, pos.x, pos.y, 20);
        });
}


function setupScroll($eventTarget, camera) {
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
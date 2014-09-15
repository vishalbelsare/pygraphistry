'use strict';

var $       = require('jquery'),
    Rx      = require('rx'),
    debug   = require('debug')('StreamGL:interaction');

require('rx-jquery');


/**
 * Adds event listeners for drag/zoom and changes the local camera position in response
 */
exports.setupDrag = function($eventTarget, camera) {
    return $eventTarget.mousedownAsObservable()
        .flatMapLatest(function(clickPos) {
            clickPos.preventDefault();

            return $('html').mousemoveAsObservable()
                .takeUntil($('html').mouseupAsObservable())
                .distinctUntilChanged(function(pos) { return {x: pos.pageX, y: pos.pageY}; })
                .scan({x: clickPos.pageX, y: clickPos.pageY}, function(accPos, curPos) {
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
};

exports.setupMousemove = function($eventTarget, hitTest, texture) {
    debug('setupMouseover');
    var bounds = $('canvas', $eventTarget[0])[0].getBoundingClientRect();

    return $eventTarget.mousemoveAsObservable()
        //.sample(10)
        .map(function (evt) {
            var pos = {
                x: evt.clientX - bounds.left,
                y: evt.clientY - bounds.top
            };
            return hitTest(texture, pos.x, pos.y, 30);
        });
};

exports.setupScroll = function($eventTarget, camera) {
    return Rx.Observable.fromEvent($eventTarget[0], 'wheel')
        .map(function(wheelEvent) {
            wheelEvent.preventDefault();

            var aspectRatio = camera.width / camera.height;
            var scrollY = wheelEvent.wheelDeltaY || wheelEvent.deltaY;

            camera.width -= camera.width * (scrollY / 100.0);
            camera.height = camera.width / aspectRatio;

            return camera;
        });
};

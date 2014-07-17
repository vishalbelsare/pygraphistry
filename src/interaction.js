"use strict";

var $ = require("jquery");
var Rx = require("rx");
var Rxjquery = require("rx-jquery");


/**
 * Adds event listeners for drag/zoom and changes the local camera position in response
 * @param
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
}



exports.setupScroll = function($eventTarget, camera) {
    return Rx.Observable.fromEvent($eventTarget[0], 'wheel')
        .map(function(wheelEvent) {
            wheelEvent.preventDefault();

            var cameraSize = camera.width > camera.height ? camera.width : camera.height;
            var cameraSizeDelta = cameraSize * (wheelEvent.wheelDeltaY / 100.0);
            camera.width += cameraSizeDelta;
            camera.height += cameraSizeDelta;

            return camera;
        })
}

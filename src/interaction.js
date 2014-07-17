"use strict";

var $ = require("jquery");
var Rx = require("rx");
var Rxjquery = require("rx-jquery");


/**
 * Adds event listeners for drag/zoom and changes the local camera position in response
 * @param
 */
exports.setupDrag = function($eventTarget, camera) {
    // An event stream w
    var cameraMoveOb = new Rx.Subject();

    // When the user clicks inside the target, listen for mousemoves until they release the mouse
    $eventTarget.on("mousedown", function(clickPos) {
        clickPos.preventDefault();

        // Observe mousemoves until the user lets go of the mouse button
        $('html').mousemoveAsObservable()
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
            })
            .subscribe(function(newCamera) {
                cameraMoveOb.onNext(newCamera);
            })
    })

    return cameraMoveOb;
};

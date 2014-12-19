// Implements the same interface as RenderGL, but does not do rendering nor initialize WebGL.
// Can be used as a drop-in replacement for RenderGL when we only want to run the sim, not renderer.

'use strict';

var RenderBase = require('./RenderBase.js');
var Q = require('q');
var debug = require('debug')('graphistry:graph-viz:render:rendernull');


var create = Q.promised(function(document) {
    var renderer = RenderBase.create();
    debug("Created renderer RenderNull");

    renderer.document = document;

    renderer.createBuffer = createBuffer.bind(this, renderer);
    renderer.setVisible = noop;
    renderer.setColorMap = noopPromise;
    renderer.finish = noop;
    renderer.render = noopPromise;

    renderer.elementsPerPoint = 2;
    renderer.numPoints = 0;
    renderer.numEdges = 0;
    renderer.numMidPoints = 0;
    renderer.numMidEdges = 0;

    return renderer;
});


var createBuffer = Q.promised(function(renderer, data) {
    debug("Creating (fake) null renderer buffer of type %s. Constructor: %o", typeof(data), (data||{}).constructor);

    var bufObj = {
        "buffer": null,
        "gl": null,
        "len": (typeof data === 'number' ? data : data.byteLength),
        "data": (typeof data === 'number' ? null : data)
    };

    return bufObj;
});


var write = function(buffer, data) { return Q(buffer); };


function noop() {
    return true;
}


var noopPromise = Q.promised(function() {
    return;
});


module.exports = {
    'create': create
}

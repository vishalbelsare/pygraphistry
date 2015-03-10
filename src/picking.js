'use strict';


var debug   = require('debug')('graphistry:StreamGL:picking');
var _       = require('underscore');

function uint32ToIdx (raw) {

    var MAX = 255 | (255 << 8) | (255 << 16);

    if (raw === 0 || raw === MAX || raw === undefined) {
        return -1;
    }

    return (raw & MAX) - 1;
}


//returns idx or -1
function hitTest(textures, canvas, x, y) {
    // debug('hit testing', texture);
    var idx = -1;
    for (var i = 0; i < textures.length; i++) {
        var canvasIdx = (canvas.height - y) * canvas.width + x;
        var raw = textures[i].map[canvasIdx];//(remapped[idx] >> 8) & (255 | (255 << 8) | (255 << 16));
        idx = uint32ToIdx(raw);
        if (idx > -1) {
            return {idx: idx, dim: textures[i].dim};
        }
    }
    return {idx: idx, dim: 0};
}


//hit test by sampling for a hit on circle's perimeter
//returns idx or -1
function hitTestCircumference(textures, canvas, x, y, r) {
    for (var attempt = 0; attempt < r * 2 * Math.PI; attempt++) {
        var attemptX = x + r * Math.round(Math.cos(attempt / r));
        var attemptY = y + r * Math.round(Math.sin(attempt / r));
        var hit = hitTest(textures, canvas, attemptX, attemptY);
        if (hit.idx > -1) {
            return hit;
        }
    }
    return {idx: -1, dim: 0};
}

//hit test by sampling for closest hit in area radius r (default to 0)
//returns idx or -1
function hitTestN(state, textures, x, y, r) {
    _.each(textures, function (texture) {
        if (!state.get('pixelreads')[texture.name]) {
            debug('no texture for hit test, escape early', texture.name);
            return;
        }
    });

    var canvas = state.get('gl').canvas;

    _.each(textures, function (texture) {
        var rawMap = state.get('pixelreads')[texture.name];
        if (!rawMap) {
            debug('not texture for hit test', texture.name);
            return;
        }

        var map = new Uint32Array(rawMap.buffer);
        texture.map = map;
    });

    // If no r, just do plain hitTest
    if (!r) {
        return hitTest(textures, canvas, x, y);
    }

    //look up to r px away
    for (var offset = 0; offset < r; offset++) {
        var hitOnCircle = hitTestCircumference(textures, canvas, x, y, offset + 1);
        if (hitOnCircle.idx > -1) {
            return hitOnCircle;
        }
    }
    return {idx: -1, dim: 0};
}

module.exports = {
    hitTest: hitTest,
    hitTestCircumference: hitTestCircumference,
    hitTestN: hitTestN,
    uint32ToIdx: uint32ToIdx
};
'use strict';


var debug   = require('debug')('graphistry:StreamGL:picking');


function uint32ToIdx (raw) {

    var MAX = 255 | (255 << 8) | (255 << 16);

    if (raw === 0 || raw === MAX || raw === undefined) {
        return -1;
    }

    return (raw & MAX) - 1;
}


//returns idx or -1
function hitTest(map, canvas, x, y) {
    // debug('hit testing', texture);
    var idx = (canvas.height - y) * canvas.width + x;
    var raw = map[idx];//(remapped[idx] >> 8) & (255 | (255 << 8) | (255 << 16));

    return uint32ToIdx(raw);
}


//hit test by sampling for a hit on circle's perimeter
//returns idx or -1
function hitTestCircumference(map, canvas, x, y, r) {
    for (var attempt = 0; attempt < r * 2 * Math.PI; attempt++) {
        var attemptX = x + r * Math.round(Math.cos(attempt / r));
        var attemptY = y + r * Math.round(Math.sin(attempt / r));
        var hit = hitTest(map, canvas, attemptX, attemptY);
        if (hit > -1) {
            return hit;
        }
    }
    return -1;
}

//hit test by sampling for closest hit in area radius r (default to 0)
//returns idx or -1
function hitTestN(state, texture, x, y, r) {

    if (!state.get('pixelreads')[texture]) {
        debug('no texture for hit test, escape early', texture);
        return;
    }

    var canvas = state.get('gl').canvas;
    var map = state.get('pixelreads')[texture];
    if (!map) {
        debug('not texture for hit test', texture);
        return;
    }
    var remapped = new Uint32Array(map.buffer);


    if (!r) {
        return hitTest(remapped, canvas, x, y);
    }

    //look up to r px away
    for (var offset = 0; offset < r; offset++) {
        var hitOnCircle = hitTestCircumference(remapped, canvas, x, y, offset + 1);
        if (hitOnCircle > -1) {
            return hitOnCircle;
        }
    }
    return -1;
}

module.exports = {
    hitTest: hitTest,
    hitTestCircumference: hitTestCircumference,
    hitTestN: hitTestN,
    uint32ToIdx: uint32ToIdx
};
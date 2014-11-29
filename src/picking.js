'use strict';

var _       = require('underscore');


var debug   = require('debug')('graphistry:StreamGL:picking');


//returns idx or -1
function hitTest(state, texture, x, y) {
    // debug('hit testing', texture);
    var canvas = state.get('gl').canvas;
    var map = state.get('pixelreads')[texture];
    if (!map) {
        debug('not texture for hit test', texture);
        return;
    }
    var remapped = new Uint32Array(map.buffer);
    var idx = (canvas.height - y) * canvas.width + x;
    var raw = remapped[idx];//(remapped[idx] >> 8) & (255 | (255 << 8) | (255 << 16));

    //swizzle because point shader is funny
    //reverse..
    var parts = _.range(0,4).map(function (_, i) {
            return (raw >> (8 * i)) & 255;
        });
    var shuffled = [parts[0], parts[1], parts[2], parts[3]];
    var r = 0,//shuffled[4],
        g = 0,//shuffled[3],
        b = shuffled[2],
        a = shuffled[1];

    var combined = ((r << 24) | (g << 16) | (b << 8) | a) - 1;

    if (combined > -1) {
        debug('hit', texture, x, y, '->', idx, '-> (', raw, '=>', combined, ') == ',
           '(', r, g, b, a, ')');
    }
    return combined;
}


//hit test by sampling for a hit on circle's perimeter
//returns idx or -1
function hitTestCircumference(state, texture, x, y, r) {
    for (var attempt = 0; attempt < r * 2 * Math.PI; attempt++) {
        var attemptX = x + r * Math.round(Math.cos(attempt / r));
        var attemptY = y + r * Math.round(Math.sin(attempt / r));
        var hit = hitTest(state, texture, attemptX, attemptY);
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

    if (!r) {
        return hitTest(state, texture, x, y);
    }

    //look up to r px away
    for (var offset = 0; offset < r; offset++) {
        var hitOnCircle = hitTestCircumference(state, texture, x, y, offset + 1);
        if (hitOnCircle > -1) {
            return hitOnCircle;
        }
    }
    return -1;
}

module.exports = {
    hitTest: hitTest,
    hitTestCircumference: hitTestCircumference,
    hitTestN: hitTestN
};
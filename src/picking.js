'use strict';


var debug   = require('debug')('graphistry:StreamGL:picking');
var _       = require('underscore');

function decodeGpuIndex (raw) {
    // Sit down and grab a drink. This might take a while.
    //
    // By now, I'm sure you've realized that we're checking against
    // a texture that has edges and points mapped onto it. We encode the
    // index of the edge/point in the color, with some of the higher bits set
    // to indicate certain flags.
    //
    // When we write the value, we encode a 3 byte number into the first 24 bits
    // of a number, with all 1's for the last byte. These correspond to RGB and A.
    // However, because the GPU does crazy stuff involving moving alpha, we end up
    // getting back alpha as the FIRST byte and RGB as the last 3 bytes. So what
    // would be 1 << 31 on the initial data is 1 << 23 when we read it. Look at the
    // renderer where it generates indices and the vertex shaders to understand more.
    //
    // We also sometimes get back garbage data from the GPU where the first byte
    // is all zero, and the last 3 bytes are all ones. So, we filter this out as MAX.
    //
    // After all that, we end up with index numbers encoded into the least significant
    // 3 bytes of the number. We unset any bit flags, mask it against MAX to get rid
    // of alpha values, then decrement by one to get zero based indices. Fun.
    //
    // Flags:
    //
    // FlagDescription              WritingIndex            ReadingIndex
    //
    // Dimension Bitmask            1 << 31                 1 << 23
    //


    var MAX = 255 | (255 << 8) | (255 << 16);
    var dimensionBitMask = 1 << 23;

    // Set dimension based on highest bit flag
    var dim = ((raw & dimensionBitMask) !== 0) ? 2 : 1;

    // Check if it's 0 or garbage data.
    if (raw === 0 || raw === MAX || raw === undefined) {
        return {dim: 0, idx: -1};
    }

    // Unset any bit masks to get back to the actual number
    var idx = raw & (~dimensionBitMask);
    // Mask away alpha and decrement to get zero-based indices
    idx = (idx & MAX) - 1;

    return {dim: dim, idx: idx};
}


//returns idx or -1
function hitTest(maps, canvas, x, y) {
    // debug('hit testing', texture);
    var retObj = {idx: -1, dim: 0};

    var canvasIdx = (canvas.height - y) * canvas.width + x;
    for (var i = 0; i < maps.length; i++) {
        var raw = maps[i][canvasIdx];
        retObj = decodeGpuIndex(raw);
        if (retObj.idx > -1) {
            return retObj;
        }
    }
    return retObj;
}


//hit test by sampling for a hit on circle's perimeter
//returns idx or -1
function hitTestCircumference(maps, canvas, x, y, r) {
    for (var attempt = 0; attempt < r * 2 * Math.PI; attempt++) {
        var attemptX = x + r * Math.round(Math.cos(attempt / r));
        var attemptY = y + r * Math.round(Math.sin(attempt / r));
        var hit = hitTest(maps, canvas, attemptX, attemptY);
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
        if (!state.get('pixelreads')[texture]) {
            debug('no texture for hit test, escape early', texture);
            return;
        }
    });

    var canvas = state.get('gl').canvas;
    var maps = [];

    _.each(textures, function (texture) {
        var rawMap = state.get('pixelreads')[texture];
        if (!rawMap) {
            debug('not texture for hit test', texture);
            return;
        }

        var map = new Uint32Array(rawMap.buffer);
        maps.push(map);
    });

    // If no r, just do plain hitTest
    if (!r) {
        return hitTest(maps, canvas, x, y);
    }

    //look up to r px away
    for (var offset = 0; offset < r; offset++) {
        var hitOnCircle = hitTestCircumference(maps, canvas, x, y, offset + 1);
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
    decodeGpuIndex: decodeGpuIndex
};

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
function hitTest(maps, width, height, x, y, numRenderedSplits) {
    // debug('hit testing', texture);
    var retObj = {idx: -1, dim: 0};

    var canvasIdx = (height - y) * width + x;
    for (var i = 0; i < maps.length; i++) {
        var raw = maps[i][canvasIdx];
        retObj = decodeGpuIndex(raw);
        if (retObj.idx > -1) {
            if (retObj.dim === 2) {
                retObj.idx = Math.floor(retObj.idx / (numRenderedSplits + 1));
            }
            return retObj;
        }
    }
    return retObj;
}


//hit test by sampling for a hit on circle's perimeter
//returns idx or -1
function hitTestCircumference(maps, width, height, x, y, r, numRenderedSplits) {
    for (var attempt = 0; attempt < r * 2 * Math.PI; attempt++) {
        var attemptX = x + r * Math.round(Math.cos(attempt / r));
        var attemptY = y + r * Math.round(Math.sin(attempt / r));
        var hit = hitTest(maps, width, height, attemptX, attemptY, numRenderedSplits);
        if (hit.idx > -1) {
            return hit;
        }
    }
    return {idx: -1, dim: 0};
}

//hit test by sampling for closest hit in area radius r (default to 0)
//returns idx or -1
//RenderState * [ String ] * float * float * uint -> {idx: -1 + int, dim: 0 + 1 + 2}
//  where dim: 0 = none, 1 = point, 2 = edge
//Textures are retina-expanded, x/y are still in CSS-space
function hitTestN(state, textures, x, y, r) {
    var numRenderedSplits = state.get('config').get('numRenderedSplits');

    var activeTextures = _.filter(textures, function (texture) {
        return state.get('pixelreads')[texture];
    });
    if (!activeTextures.length) {
        debug('no texture for hit test, escape early');
        return {idx: -1, dim: 0};
    }


    var SAMPLER = state.get('config').get('textures').get('hitmap').toJS();
    var SAMPLE_RATE_WIDTH = SAMPLER.width ?  0.01 * SAMPLER.width.value : 1;
    var SAMPLE_RATE_HEIGHT = SAMPLER.height ? 0.01 * SAMPLER.height.value : 1;

    var canvas = state.get('gl').canvas;
    //already retina-expanded
    var textureWidth = Math.floor(canvas.width * SAMPLE_RATE_WIDTH);
    var textureHeight = Math.floor(canvas.height * SAMPLE_RATE_HEIGHT);
    var pixelRatio = state.get('camera').pixelRatio;

    var retinaX = Math.floor(x * pixelRatio * SAMPLE_RATE_WIDTH);
    var retinaY = Math.floor(y * pixelRatio * SAMPLE_RATE_HEIGHT);

    var maps = _.map(activeTextures, function (texture) {
        return new Uint32Array(state.get('pixelreads')[texture].buffer);
    });

    // If no r, just do plain hitTest
    if (!r) {
        return hitTest(maps, textureWidth, textureHeight, retinaX, retinaY, numRenderedSplits);
    }

    //look up to r px away
    for (var offset = 0; offset < r; offset++) {
        var hitOnCircle = hitTestCircumference(maps, textureWidth, textureHeight, retinaX, retinaY, offset + 1, numRenderedSplits);
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

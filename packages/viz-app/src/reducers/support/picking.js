var debug   = require('debug')('graphistry:StreamGL:picking');
var MAX = 255 | (255 << 8) | (255 << 16);
var dimensionBitMask = 1 << 23;

/**
 * @param {Number} raw
 * @returns {VizSliceElement}
 */
function decodeGpuElement (raw, hit = {idx: -1, dim: 0}) {
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

    // Check if it's 0 or garbage data.
    if (raw === 0 || raw === MAX || raw === undefined) {
        hit.dim = 0;
        hit.idx = -1;
    } else {
        hit.dim = decodeGpuDim(raw);
        hit.idx = decodeGpuIndex(raw);
    }

    return hit;
}

// A function that decodes gpu color data into index
function decodeGpuIndex (raw) {

    // Check if it's 0 or garbage data.
    if (raw === 0 || raw === MAX || raw === undefined) {
        return -1;
    }

    var idx = raw & (~dimensionBitMask);
    idx = (idx & MAX) - 1;
    return idx;
}

// A function that decodes gpu color data into dimension (e.g., node vs edge)
function decodeGpuDim (raw) {
    // Set dimension based on highest bit flag
    var dim = ((raw & dimensionBitMask) !== 0) ? 2 : 1;
    return dim;
}


/**
 * returns idx or -1
 * @returns {VizSliceElement}
 */
function hitTest(maps, width, height, x, y, numRenderedSplits, hit = {idx: -1, dim: 0}) {
    // debug('hit testing', texture);

    var canvasIdx = (height - y) * width + x;
    for (var i = 0; i < maps.length; i++) {
        var raw = maps[i][canvasIdx];
        hit = decodeGpuElement(raw, hit);
        if (hit.idx > -1) {
            if (hit.dim === 2) {
                hit.idx = Math.floor(hit.idx / (numRenderedSplits + 1));
            }
            return hit;
        }
    }
    hit.dim = 0;
    return hit;
}


/**
 * hit test by sampling for a hit on circle's perimeter
 * returns idx or -1
 * @returns {VizSliceElement}
 */
function hitTestCircumference(maps, width, height, x, y, r, numRenderedSplits, hit = {idx: -1, dim: 0}) {
    const circumference = r * 2 * Math.PI;
    for (let point = 0; point < circumference; point++) {
        let pointX = Math.round(x + r * Math.cos(point / r));
        let pointY = Math.round(y + r * Math.sin(point / r));
        hit = hitTest(maps, width, height, pointX, pointY, numRenderedSplits, hit);
        if (hit.idx > -1) {
            return hit;
        }
    }
    return hit;
}

/**
 * hit test by sampling for closest hit in area radius r (default to 0)
 * returns idx or -1
 *
 * RenderState * [ String ] * float * float * uint -> {idx: -1 + int, dim: 0 + 1 + 2}
 * where dim: 0 = none, 1 = point, 2 = edge
 * @param {RenderState} state
 * @param {String[]} textures Textures are retina-expanded, x/y are still in CSS-space
 * @returns {VizSliceElement}
 */
function hitTestN(state, textures, x, y, r) {

    var numRenderedSplits = state.config.numRenderedSplits;
    var activeTextures = textures.filter((texture) => state.pixelreads[texture]);

    if (!activeTextures.length) {
        debug('no texture for hit test, escape early');
        return {idx: -1, dim: 0};
    }


    var SAMPLER = state.config.textures.hitmap;
    var SAMPLE_RATE_WIDTH = SAMPLER.width ?  0.01 * SAMPLER.width.value : 1;
    var SAMPLE_RATE_HEIGHT = SAMPLER.height ? 0.01 * SAMPLER.height.value : 1;

    var canvas = state.gl.canvas;
    //already retina-expanded
    var textureWidth = Math.floor(canvas.width * SAMPLE_RATE_WIDTH);
    var textureHeight = Math.floor(canvas.height * SAMPLE_RATE_HEIGHT);
    var pixelRatio = state.camera.pixelRatio;

    var retinaX = Math.floor(x * pixelRatio * SAMPLE_RATE_WIDTH);
    var retinaY = Math.floor(y * pixelRatio * SAMPLE_RATE_HEIGHT);

    var hit = {idx: -1, dim: 0};
    var maps = activeTextures.map((texture) => new Uint32Array(state.pixelreads[texture].buffer));

    // If no r, just do plain hitTest
    if (!r) {
        return hitTest(maps, textureWidth, textureHeight, retinaX, retinaY, numRenderedSplits, hit);
    }

    //look up to r px away
    for (var offset = 0; offset < r; offset++) {
        hit = hitTestCircumference(maps, textureWidth, textureHeight, retinaX, retinaY, offset + 1, numRenderedSplits, hit);
        if (hit.idx > -1) {
            return hit;
        }
    }
    hit.dim = 0;
    return hit;
}

export {
    hitTest,
    hitTestCircumference,
    hitTestN,
    decodeGpuIndex,
    decodeGpuElement
};

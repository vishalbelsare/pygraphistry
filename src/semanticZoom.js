'use strict';

function pointZoomScalingFactor(width, height, numPoints) {

    // To zoom in, we use the quadroot of the ratio of
    // points to area to estimate our zoom level. This also has
    // to be adjusted by a constant, which depends on the size of the
    // dataset. We combine constants for small datasets and large datasets
    // using alpha, which is a measure of how "big" a dataset is.

    var pointSizeConstantBig = 1.0;
    var pointSizeConstantSmall = 7.5;
    var numPointsOffset = Math.max(numPoints - 150, 10);
    var alpha = Math.min(1, Math.log(numPointsOffset)/Math.log(10000000));

    var area = width * height;
    var scalingFactor = Math.sqrt(Math.sqrt(numPoints/area));

    var normalizedScalingFactor =
        scalingFactor * ((1-alpha)*pointSizeConstantSmall + alpha*pointSizeConstantBig);

    return normalizedScalingFactor;
}

module.exports = {
    pointZoomScalingFactor: pointZoomScalingFactor
};

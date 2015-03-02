'use strict';

function pointZoomScalingFactor(width, height, numPoints) {
    var pointSizeConstant = 0.15;
    var area = width * height;
    return pointSizeConstant * (Math.sqrt(numPoints) / (Math.sqrt(Math.sqrt(area))));
}

module.exports = {
    pointZoomScalingFactor: pointZoomScalingFactor
};

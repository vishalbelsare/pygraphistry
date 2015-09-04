'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:canvas');
var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');
var _       = require('underscore');

var interaction     = require('./interaction.js');
var util            = require('./util.js');
var labels          = require('./labels.js');
var renderer        = require('../renderer');
var colorPicker     = require('./colorpicker.js');


function setupCameraInteractions(appState, $eventTarget) {
    var renderState = appState.renderState;
    var camera = renderState.get('camera');
    var canvas = renderState.get('canvas');

    //pan/zoom
    //Observable Event
    var interactions;
    if (interaction.isTouchBased) {
        debug('Detected touch-based device. Setting up touch interaction event handlers.');
        var eventTarget = $eventTarget[0];
        interactions = interaction.setupSwipe(eventTarget, camera)
            .merge(
                interaction.setupPinch($eventTarget, camera)
                    .flatMapLatest(util.observableFilter(appState.anyMarqueeOn, util.notIdentity)));
    } else {
        debug('Detected mouse-based device. Setting up mouse interaction event handlers.');
        interactions = interaction.setupDrag($eventTarget, camera, appState)
            .merge(interaction.setupScroll($eventTarget, canvas, camera, appState));
    }

    return Rx.Observable.merge(
        interactions,
        interaction.setupRotate(camera),
        interaction.setupCenter($('#center'),
                                renderState.get('hostBuffers').curPoints,
                                camera),
        interaction.setupZoomButton($('#zoomin'), camera, 1 / 1.25)
            .flatMapLatest(util.observableFilter(appState.anyMarqueeOn, util.notIdentity)),
        interaction.setupZoomButton($('#zoomout'), camera, 1.25)
            .flatMapLatest(util.observableFilter(appState.anyMarqueeOn, util.notIdentity))
    );
}

/* Deindexed logical edges by looking up the x/y positions of the source and destination
 * nodes. */
//function expandLogicalEdges(bufferSnapshots) {
    //var logicalEdges = new Uint32Array(bufferSnapshots.logicalEdges.buffer);
    //var curPoints = new Float32Array(bufferSnapshots.curPoints.buffer);
    //var numVertices = logicalEdges.length;

    //if (!bufferSnapshots.springsPos) {
        //bufferSnapshots.springsPos = new Float32Array(numVertices * 2);
    //}
    //var springsPos = bufferSnapshots.springsPos;

    //for (var i = 0; i < numVertices; i++) {
        //springsPos[2 * i]     = curPoints[2 * logicalEdges[i]];
        //springsPos[2 * i + 1] = curPoints[2 * logicalEdges[i] + 1];
    //}

    //return springsPos;
//}

function setupLabelsAndCursor(appState, urlParams, $eventTarget) {
    // Picks objects in priority based on order.
    var hitMapTextures = ['hitmap'];
    var latestHighlightedObject = labels.getLatestHighlightedObject(appState, $eventTarget, hitMapTextures);

    labels.setupCursor(appState.renderState, appState.renderingScheduler, appState.isAnimatingOrSimulating, latestHighlightedObject);
    labels.setupLabels(appState, urlParams, $eventTarget, latestHighlightedObject);
}

function setupRenderUpdates(renderingScheduler, cameraStream, settingsChanges) {
    settingsChanges
        .combineLatest(cameraStream, _.identity)
        .do(function () {
            renderingScheduler.renderScene('panzoom', {trigger: 'renderSceneFast'});
        }).subscribe(_.identity, util.makeErrorHandler('render updates'));
}

function setupBackgroundColor(renderingScheduler, bgColor) {
    bgColor.do(function (color) {
        renderingScheduler.renderState.get('options').clearColor = [colorPicker.renderConfigValueForColor(color)];
        renderingScheduler.renderScene('bgcolor', {trigger: 'renderSceneFast'});
    }).subscribe(_.identity, util.makeErrorHandler('background color updates'));
}

//int * int * Int32Array * Float32Array -> {starts: Float32Array, ends: Float32Array}
//Scatter: label each midedge with containing edge's start/end pos (used for dynamic culling)
function expandMidEdgeEndpoints(numEdges, numRenderedSplits, logicalEdges, curPoints) {

    var starts = new Float32Array(numEdges * (numRenderedSplits + 1) * 4);
    var ends = new Float32Array(numEdges * (numRenderedSplits + 1) * 4);
    var offset = 0;

    for (var edgeIndex = 0; edgeIndex < numEdges; edgeIndex++) {
        var srcPointIdx = logicalEdges[edgeIndex * 2];
        var dstPointIdx = logicalEdges[(edgeIndex * 2) + 1];
        var srcPointX = curPoints[(2 * srcPointIdx)];
        var srcPointY = curPoints[(2 * srcPointIdx)+ 1];
        var dstPointX = curPoints[(2 * dstPointIdx)];
        var dstPointY = curPoints[(2 * dstPointIdx) + 1];
        for (var midPointIdx = 0; midPointIdx < numRenderedSplits + 1; midPointIdx++) {
            starts[offset + 0] = srcPointX;
            starts[offset + 1] = srcPointY;
            starts[offset + 2] = srcPointX;
            starts[offset + 3] = srcPointY;
            ends[offset + 0] = dstPointX;
            ends[offset + 1] = dstPointY;
            ends[offset + 2] = dstPointX;
            ends[offset + 3] = dstPointY;
            offset += 4;
        }
    }

    return {starts: starts, ends: ends};

}

// -> {midSpringsPos: Float32Array, midSpringsEndpoints: Float32Array}
function expandLogicalEdges(bufferSnapshots, numRenderedSplits, edgeHeight) {
    var logicalEdges, curPoints, srcPointIdx, dstPointIdx, srcPointX, srcPointY,
            dstPointX, dstPointY;

    logicalEdges = new Uint32Array(bufferSnapshots.logicalEdges.buffer);
    curPoints = new Float32Array(bufferSnapshots.curPoints.buffer);
    var numEdges = (logicalEdges.length / 2);

    var numVertices = (2 * numEdges) * (numRenderedSplits + 1);

    if (!bufferSnapshots.midSpringsPos) {
        bufferSnapshots.midSpringsPos = new Float32Array(numVertices * 2);
    } else {
        // Wrap it again with an updated size.
        bufferSnapshots.midSpringsPos = new Float32Array(bufferSnapshots.midSpringsPos.buffer, 0, numVertices * 2);
    }


    var midSpringsPos = bufferSnapshots.midSpringsPos;
    var midEdgesPerEdge = numRenderedSplits + 1;
    var midEdgeStride = 4 * midEdgesPerEdge;

    function setMidEdge(edgeIdx, midEdgeIdx, srcMidPointX, srcMidPointY, dstMidPointX, dstMidPointY) {
        var midEdgeStartIdx = edgeIndex * midEdgeStride;
        var index = midEdgeStartIdx + (midEdgeIdx * 4);
        midSpringsPos[index] = srcMidPointX;
        midSpringsPos[index + 1] = srcMidPointY;
        midSpringsPos[index + 2] = dstMidPointX;
        midSpringsPos[index + 3] = dstMidPointY;
    }


    var unitRadius = (1 + Math.pow(edgeHeight, 2)) / (2 * edgeHeight);
    var theta = Math.asin((1  / unitRadius)) * 2;
    var thetaStep = -theta /  (numRenderedSplits + 1);

    var cosArray = new Float32Array(numRenderedSplits);
    var sinArray = new Float32Array(numRenderedSplits);
    var curTheta;
    for (var midPointIdx = 0; midPointIdx < numRenderedSplits; midPointIdx++) {
        curTheta = thetaStep * (midPointIdx + 1);
        cosArray[midPointIdx] = Math.cos(curTheta);
        sinArray[midPointIdx] = Math.sin(curTheta);
    }


    //for each midedge, start x/y & end x/y
    var midSpringsEndpoints = expandMidEdgeEndpoints(numEdges, numRenderedSplits, logicalEdges, curPoints);

    for (var edgeIndex = 0; edgeIndex < numEdges; edgeIndex += 1) {
        srcPointIdx = logicalEdges[edgeIndex * 2];
        dstPointIdx = logicalEdges[(edgeIndex * 2) + 1];
        srcPointX = curPoints[(2 * srcPointIdx)];
        srcPointY = curPoints[(2 * srcPointIdx)+ 1];
        dstPointX = curPoints[(2 * dstPointIdx)];
        dstPointY = curPoints[(2 * dstPointIdx) + 1];
        var edgeLength = Math.sqrt(Math.pow((dstPointX - srcPointX), 2) + Math.pow((dstPointY - srcPointY), 2));
        var height = edgeHeight * (edgeLength / 2);
        var edgeDirectionX = (srcPointX -  dstPointX) / edgeLength;
        var edgeDirectionY = (srcPointY -  dstPointY) / edgeLength;
        var radius = unitRadius * (edgeLength / 2);
        var midPointX = (srcPointX + dstPointX) / 2;
        var midPointY = (srcPointY + dstPointY) / 2;
        var centerPointX = midPointX + (radius - height) * (-1 * edgeDirectionY);
        var centerPointY = midPointY + (radius - height) * (edgeDirectionX);
        var startRadiusX = srcPointX - centerPointX;
        var startRadiusY = srcPointY - centerPointY;

        var prevPointX = srcPointX;
        var prevPointY = srcPointY;
        var nextPointX;
        var nextPointY;
        for (midPointIdx = 0; midPointIdx < numRenderedSplits; midPointIdx++) {
            var cos = cosArray[midPointIdx];
            var sin = sinArray[midPointIdx];
            nextPointX = centerPointX + (cos * startRadiusX) - (sin * startRadiusY);
            nextPointY = centerPointY + (sin * startRadiusX) + (cos * startRadiusY);
            setMidEdge(edgeIndex, midPointIdx, prevPointX, prevPointY, nextPointX, nextPointY);
            prevPointX = nextPointX;
            prevPointY = nextPointY;
        }
        setMidEdge(edgeIndex, numRenderedSplits,  prevPointX, prevPointY, dstPointX, dstPointY);
    }
    return {
        midSpringsPos: midSpringsPos,
        midSpringsStarts: midSpringsEndpoints.starts,
        midSpringsEnds: midSpringsEndpoints.ends
    };
}


// interpolates a quadratic curve through the end points a midpoint. Then sets the
// rendered midedge positions based on this curve
function getPolynomialCurves(bufferSnapshots, interpolateMidPoints, numRenderedSplits) {
    var logicalEdges = new Uint32Array(bufferSnapshots.logicalEdges.buffer);
    var curMidPoints = null;
    var numSplits = 0;
    if (!interpolateMidPoints) {
        curMidPoints = new Float32Array(bufferSnapshots.curMidPoints.buffer);
        numSplits = curMidPoints.length  / logicalEdges.length;
    } else {
        // TODO We can only handle one midpoint as of now.
        numSplits = 1;
    }

    var curPoints = new Float32Array(bufferSnapshots.curPoints.buffer);

    //var numEdgesRendered = 3;

    if (numSplits < 1) {
        numSplits = 0;
    }

    if (numSplits > 1) {
        console.debug('More than one midpoint not supported!');
    }
    //var numMidEdges = numSplits + 1;
    var numEdges = (logicalEdges.length / 2);

    var numVertices = (2 * numEdges) * (numRenderedSplits + 1);

    if (!bufferSnapshots.midSpringsPos) {
        bufferSnapshots.midSpringsPos = new Float32Array(numVertices * 2);
    }
    var midSpringsPos = bufferSnapshots.midSpringsPos;

    var srcPointIdx, dstPointIdx, midEdgeIndex, theta, cos, sin, srcPointX, srcPointY, dstPointX, dstPointY, midPointX, midPointY, length;

    // output array that contains the vector of the transformed destination point
    var transformedDstPoint = new Float32Array(2);
    // output array that contains the vector of the transformed midpoint
    var transformedMidPoint = new Float32Array(2);
    // Quadratic curve parameters. Set by setCurveParameters.
    var beta0, beta1, beta2;
    var invX = new Float32Array(9);

    var dstMidPoint = new Float32Array(2);
    var midEdgesPerEdge = numRenderedSplits + 1;
    var midEdgeStride = 4 * midEdgesPerEdge;
    var srcMidPointX;
    var srcMidPointY;
    for (var edgeIndex = 0; edgeIndex < numEdges; edgeIndex += 1) {
        var midEdgeStartIdx = edgeIndex * midEdgeStride;
        srcMidPointX = srcPointX;
        srcMidPointY = srcPointY;
        expandEdge(edgeIndex);
        if (numRenderedSplits > 0) {
        setCurveParameters();
        // Set first midpoint to source point of edge
            for (var midEdgeIdx = 0; midEdgeIdx < (numRenderedSplits); midEdgeIdx++) {
                var lambda = (midEdgeIdx + 1) / (numRenderedSplits + 1);
                getMidPointPosition(lambda, dstMidPoint);
                setMidEdge(edgeIndex, midEdgeIdx, srcMidPointX, srcMidPointY, dstMidPoint[0], dstMidPoint[1]);
                srcMidPointX = dstMidPoint[0];
                srcMidPointY = dstMidPoint[1];
            }
        }

        // Set last midedge position to previous midpoint and edge destination
        setMidEdge(edgeIndex, numRenderedSplits, srcMidPointX, srcMidPointY, dstPointX, dstPointY);
    }
    return midSpringsPos;

    function expandEdge(edgeIndex) {
        srcPointIdx = logicalEdges[edgeIndex * 2];
        dstPointIdx = logicalEdges[(edgeIndex * 2) + 1];

        srcPointX = curPoints[(2 * srcPointIdx)];
        srcPointY = curPoints[(2 * srcPointIdx)+ 1];
        dstPointX = curPoints[(2 * dstPointIdx)];
        dstPointY = curPoints[(2 * dstPointIdx) + 1];
        // TODO this can be removed or should be generalized to multiple midpoints.

        length = Math.pow(Math.pow(dstPointX - srcPointX, 2) + Math.pow(dstPointY - srcPointY, 2), 0.5);

        theta = Math.atan2(dstPointY - srcPointY, dstPointX - srcPointX);

        var HEIGHT = 0.2;
        function interpolateArcMidPoint() {
            var actualMidPointX = (srcPointX + dstPointX) / 2;
            var actualMidPointY = (srcPointY + dstPointY) / 2;
            var directionX = (srcPointX - dstPointX) / length;
            var directionY = (srcPointY - dstPointY) / length;
            midPointX = actualMidPointX + (directionY * HEIGHT * (length / 2));
            midPointY = actualMidPointY + (-directionX * HEIGHT * (length / 2));
        }

        if (interpolateMidPoints) {
            interpolateArcMidPoint();
        } else {
            midEdgeIndex = 0;
            midPointX = curMidPoints[(edgeIndex * 2 * (numSplits)) + (midEdgeIndex * 2)];
            midPointY = curMidPoints[(edgeIndex * 2 * (numSplits)) + (midEdgeIndex * 2) + 1];
        }


        cos = Math.cos(theta);
        sin = Math.sin(theta);
    }

    function toEdgeBasisMem(vectorX, vectorY, output) {
        var diffX = vectorX - srcPointX;
        var diffY = vectorY - srcPointY;
        output[0] = (cos * diffX) + (sin * diffY);
        output[1] = (-sin * diffX) + (cos * diffY);
    }

    function fromEdgeBasisMem(vectorX, vectorY, output) {
        output[0] = srcPointX + ((cos * vectorX) + (-sin * vectorY));
        output[1] = srcPointY + ((sin * vectorX) + (cos * vectorY));
    }

    function inverseMem(m0, m1, m2, m3, m4, m5, m6, m7, m8, mem) {
        var det = m0 * ((m4 * m8) - (m5 * m7)) -
            m1 * ((m3 * m8) - (m5 * m6)) +
            m2 * ((m3 * m7) - (m4 * m6));
        // First row
        mem[0] = ((m4 * m8) - (m5 * m7)) / det;
        mem[1] = ((m2 * m7) - (m1 * m8)) / det;
        mem[2] = ((m1 * m5) - (m2 * m4)) / det;

        // Second Row
        mem[3] = ((m5 * m6) - (m3 * m8)) / det;
        mem[4] = ((m1 * m8) - (m2 * m6)) / det;
        mem[5] = ((m2 * m3) - (m1 * m5)) / det;

        // Third Row
        mem[6] = ((m3 * m7) - (m4 * m6)) / det;
        mem[7] = ((m1 * m6) - (m1 * m7)) / det;
        mem[8] = ((m1 * m4) - (m1 * m4)) / det;
    }

    function setCurveParameters() {
        toEdgeBasisMem(dstPointX, dstPointY, transformedDstPoint);
        toEdgeBasisMem(midPointX, midPointY, transformedMidPoint);

        var yVector0 = 0;
        var yVector1 = transformedMidPoint[1];
        var yVector2 = transformedDstPoint[1];

        var xVector0 = 0;
        var xVector1 = 0;
        var xVector2 = 1;
        var xVector3 = Math.pow(transformedMidPoint[0], 2);
        var xVector4 = transformedMidPoint[0];
        var xVector5 = 1;
        var xVector6 = Math.pow(transformedDstPoint[0], 2);
        var xVector7 = transformedDstPoint[0];
        var xVector8 = 1;

        inverseMem(xVector0, xVector1, xVector2, xVector3, xVector4, xVector5, xVector6, xVector7,
                   xVector8, invX);

        beta0 = (invX[0] * yVector0) + (invX[1] * yVector1) + (invX[2] * yVector2);
        beta1 = (invX[3] * yVector0) + (invX[4] * yVector1) + (invX[5] * yVector2);
        beta2 = (invX[6] * yVector0) + (invX[7] * yVector1) + (invX[8] * yVector2);
    }
    function computePolynomial(x) {
        return (Math.pow(x, 2) * beta0) + (x * beta1) + (1 * beta2);
    }

    function getMidPointPosition(lambda, output) {
        var x;
        x = lambda * length;
        fromEdgeBasisMem(x, computePolynomial(x), output);
    }

    function setMidEdge(edgeIdx, midEdgeIdx, srcMidPointX, srcMidPointY, dstMidPointX, dstMidPointY) {
        var index = midEdgeStartIdx + (midEdgeIdx * 4);
        midSpringsPos[index] = srcMidPointX;
        midSpringsPos[index + 1] = srcMidPointY;
        midSpringsPos[index + 2] = dstMidPointX;
        midSpringsPos[index + 3] = dstMidPointY;
    }

}

function expandLogicalMidEdges(bufferSnapshots) {
    var logicalEdges = new Uint32Array(bufferSnapshots.logicalEdges.buffer);
    var curMidPoints = new Float32Array(bufferSnapshots.curMidPoints.buffer);
    var curPoints = new Float32Array(bufferSnapshots.curPoints.buffer);
    var numSplits = curMidPoints.length  / logicalEdges.length;

    if (numSplits < 1) {
        numSplits = 0;
    }
    //var numMidEdges = numSplits + 1;
    var numEdges = (logicalEdges.length / 2);

    var numVertices = (2 * numEdges) * (numSplits + 1);


    //for each midedge, start x/y & end x/y
    var midSpringsEndpoints = expandMidEdgeEndpoints(numEdges, numSplits, logicalEdges, curPoints);



    if (!bufferSnapshots.midSpringsPos) {
        bufferSnapshots.midSpringsPos = new Float32Array(numVertices * 2);
    }
    var midSpringsPos = bufferSnapshots.midSpringsPos;

    for (var edgeIndex = 0; edgeIndex < numEdges; edgeIndex += 1) {
        var srcPointIdx = logicalEdges[edgeIndex * 2];
        var dstPointIdx = logicalEdges[(edgeIndex * 2) + 1];

        var srcPointX = curPoints[(2 * srcPointIdx)];
        var srcPointY = curPoints[(2 * srcPointIdx)+ 1];
        //var srcPoint = [srcPointX, srcPointY];
        var dstPointX = curPoints[(2 * dstPointIdx)];
        var dstPointY = curPoints[(2 * dstPointIdx) + 1];

        var elementsPerPoint = 2;
        var pointsPerEdge = 2;
        var midEdgesPerEdge = numSplits + 1;
        var midEdgeStride = elementsPerPoint * pointsPerEdge * midEdgesPerEdge;
        var midEdgeStartIdx = edgeIndex * midEdgeStride;

        midSpringsPos[midEdgeStartIdx] =  srcPointX;
        midSpringsPos[midEdgeStartIdx + 1] =  srcPointY;
        var prevX = srcPointX;
        var prevY = srcPointY;

        for (var midEdgeIdx = 0; midEdgeIdx < numSplits; midEdgeIdx++) {

            midSpringsPos[midEdgeStartIdx + (midEdgeIdx * 4)] = prevX;
            midSpringsPos[midEdgeStartIdx + (midEdgeIdx * 4) + 1] = prevY;

            prevX = curMidPoints[(edgeIndex * 2 * (numSplits)) + (midEdgeIdx * 2)];
            prevY = curMidPoints[(edgeIndex * 2 * (numSplits)) + (midEdgeIdx * 2) + 1];

            midSpringsPos[midEdgeStartIdx + (midEdgeIdx * 4) + 2] = prevX;
            midSpringsPos[midEdgeStartIdx + (midEdgeIdx * 4) + 3] = prevY;
        }
        midSpringsPos[((edgeIndex + 1) * midEdgeStride) - 4] =  prevX;
        midSpringsPos[((edgeIndex + 1) * midEdgeStride) - 3] =  prevY;

        midSpringsPos[((edgeIndex + 1) * midEdgeStride) - 2] =  dstPointX;
        midSpringsPos[((edgeIndex + 1) * midEdgeStride) - 1] =  dstPointY;
    }

    return {
        midSpringsPos: midSpringsPos,
        midSpringsStarts: midSpringsEndpoints.starts,
        midSpringsEnds: midSpringsEndpoints.ends
    };
}

/* Populate arrow buffers. The first argument is either an array of indices,
 * or an integer value of how many you want.
 */
function populateArrowBuffers(maybeIterable, midSpringsPos, arrowStartPos,
        arrowEndPos, arrowNormalDir, pointSizes, logicalEdges,
        arrowPointSizes, arrowColors, edgeColors, numRenderedSplits) {


    var edgeColors32 = new Uint32Array(edgeColors.buffer);

    var numMidEdges = numRenderedSplits + 1;


    var isIterable = maybeIterable.constructor === Array;
    var forLimit = (isIterable) ? maybeIterable.length : maybeIterable;

    //var start = new Float32Array(2);
    //var end = new Float32Array(2);
    var startX, startY, endX, endY;
    for (var idx = 0; idx < forLimit; idx++) {
        var val = (isIterable) ? maybeIterable[idx] : idx;

        var midEdgeIdx = ((val + 1) * ((numMidEdges) * 4) -4);
        startX = midSpringsPos[midEdgeIdx + 0];
        startY = midSpringsPos[midEdgeIdx + 1];
        endX   = midSpringsPos[midEdgeIdx + 2];
        endY   = midSpringsPos[midEdgeIdx + 3];

        arrowStartPos[6*idx + 0] = startX;
        arrowStartPos[6*idx + 1] = startY;
        arrowStartPos[6*idx + 2] = startX;
        arrowStartPos[6*idx + 3] = startY;
        arrowStartPos[6*idx + 4] = startX;
        arrowStartPos[6*idx + 5] = startY;

        arrowEndPos[6*idx + 0] = endX;
        arrowEndPos[6*idx + 1] = endY;
        arrowEndPos[6*idx + 2] = endX;
        arrowEndPos[6*idx + 3] = endY;
        arrowEndPos[6*idx + 4] = endX;
        arrowEndPos[6*idx + 5] = endY;

        arrowNormalDir[3*idx + 0] = 0;  // Tip vertex
        arrowNormalDir[3*idx + 1] = 1;  // Left vertex
        arrowNormalDir[3*idx + 2] = -1; // Right vertex

        var pointSize = pointSizes[logicalEdges[2*val+ 1]];
        arrowPointSizes[3*idx + 0] = pointSize;
        arrowPointSizes[3*idx + 1] = pointSize;
        arrowPointSizes[3*idx + 2] = pointSize;

        arrowColors[3*idx + 0] = edgeColors32[2*val + 1];
        arrowColors[3*idx + 1] = edgeColors32[2*val + 1];
        arrowColors[3*idx + 2] = edgeColors32[2*val + 1];

    }
}

function getMidEdgeColors(bufferSnapshot, numEdges, numRenderedSplits) {
    var midEdgeColors, edges, edgeColors, srcNodeIdx, dstNodeIdx, srcColorInt, srcColor,
        dstColorInt, dstColor, edgeIndex, midEdgeIndex, numSegments, lambda,
        colorHSVInterpolator, convertRGBInt2Color, convertColor2RGBInt, interpolatedColorInt;

    var numMidEdgeColors = numEdges * (numRenderedSplits + 1);

    var interpolatedColor = {};
    srcColor = {};
    dstColor = {};

    if (!midEdgeColors) {
        midEdgeColors = new Uint32Array(numMidEdgeColors);
        numSegments = numRenderedSplits + 1;
        edges = new Uint32Array(bufferSnapshot.logicalEdges.buffer);
        edgeColors = new Uint32Array(bufferSnapshot.edgeColors.buffer);

        // Interpolate colors in the HSV color space.
        colorHSVInterpolator = function (color1, color2, lambda) {
            var color1HSV, color2HSV, h, s, v;
            color1HSV = color1.hsv();
            color2HSV = color2.hsv();
            var h1 = color1HSV.h;
            var h2 = color2HSV.h;
            var maxCCW = h1 - h2;
            var maxCW =  (h2 + 360) - h1;
            var hueStep;
            if (maxCW > maxCCW) {
                //hueStep = higherHue - lowerHue;
                //hueStep = h2 - h1;
                hueStep = h2 - h1;
            } else {
                //hueStep = higherHue - lowerHue;
                hueStep = (360 + h2) - h1;
            }
            h = (h1 + (hueStep * (lambda))) % 360;
            //h = color1HSV.h * (1 - lambda) + color2HSV.h * (lambda);
            s = color1HSV.s * (1 - lambda) + color2HSV.s * (lambda);
            v = color1HSV.v * (1 - lambda) + color2HSV.v * (lambda);
            return interpolatedColor.hsv([h, s, v]);
        };

        var colorRGBInterpolator = function (color1, color2, lambda) {
            var r, g, b;
            r = color1.r * (1 - lambda) + color2.r * (lambda);
            g = color1.g * (1 - lambda) + color2.g * (lambda);
            b = color1.b * (1 - lambda) + color2.b * (lambda);
            return {
                r: r,
                g: g,
                b: b
            };
        };

        // Convert from HSV to RGB Int
        convertColor2RGBInt = function (color) {
            return (color.r << 0) + (color.g << 8) + (color.b << 16);
        };

        // Convert from RGB Int to HSV
        convertRGBInt2Color= function (rgbInt) {
            return {
                r:rgbInt & 0xFF,
                g:(rgbInt >> 8) & 0xFF,
                b:(rgbInt >> 16) & 0xFF
            };
        };

        for (edgeIndex = 0; edgeIndex < numEdges; edgeIndex++) {
            srcNodeIdx = edges[2 * edgeIndex];
            dstNodeIdx = edges[2 * edgeIndex + 1];

            srcColorInt = edgeColors[2 * edgeIndex];
            dstColorInt = edgeColors[2 * edgeIndex + 1];

            srcColor = convertRGBInt2Color(srcColorInt);
            dstColor = convertRGBInt2Color(dstColorInt);

            interpolatedColorInt = convertColor2RGBInt(srcColor);

            for (midEdgeIndex = 0; midEdgeIndex < numSegments; midEdgeIndex++) {
                midEdgeColors[(2 * edgeIndex) * numSegments + (2 * midEdgeIndex)] =
                    interpolatedColorInt;
                lambda = (midEdgeIndex + 1) / (numSegments);
                interpolatedColorInt =
                    convertColor2RGBInt(colorRGBInterpolator(srcColor, dstColor, lambda));
                midEdgeColors[(2 * edgeIndex) * numSegments + (2 * midEdgeIndex) + 1] =
                    interpolatedColorInt;
            }
        }
        return midEdgeColors;
    }
}

function makeArrows(bufferSnapshots, edgeMode, numRenderedSplits) {
    var logicalEdges = new Uint32Array(bufferSnapshots.logicalEdges.buffer);
    var pointSizes = new Uint8Array(bufferSnapshots.pointSizes.buffer);
    var edgeColors = new Uint32Array(bufferSnapshots.edgeColors.buffer);
    var numEdges = logicalEdges.length / 2;

    if (!bufferSnapshots.arrowStartPos) {
        bufferSnapshots.arrowStartPos = new Float32Array(numEdges * 2 * 3);
    }
    var arrowStartPos = bufferSnapshots.arrowStartPos;

    if (!bufferSnapshots.arrowEndPos) {
        bufferSnapshots.arrowEndPos = new Float32Array(numEdges * 2 * 3);
    }
    var arrowEndPos = bufferSnapshots.arrowEndPos;

    if (!bufferSnapshots.arrowNormalDir) {
        bufferSnapshots.arrowNormalDir = new Float32Array(numEdges * 3);
    }
    var arrowNormalDir = bufferSnapshots.arrowNormalDir;

    if (!bufferSnapshots.arrowColors) {
        bufferSnapshots.arrowColors = new Uint32Array(numEdges * 3);
    }
    var arrowColors = bufferSnapshots.arrowColors;

    if (!bufferSnapshots.arrowPointSizes) {
        bufferSnapshots.arrowPointSizes = new Uint8Array(numEdges * 3);
    }
    var arrowPointSizes = bufferSnapshots.arrowPointSizes;

    populateArrowBuffers(numEdges, bufferSnapshots.midSpringsPos, arrowStartPos,
            arrowEndPos, arrowNormalDir, pointSizes, logicalEdges,
            arrowPointSizes, arrowColors, edgeColors, numRenderedSplits);
}

/*
 * Render expensive items (eg, edges) when a quiet state is detected. This function is called
 * from within an animation frame and must execture all its work inside it. Callbacks(rx, etc)
 * are not allowed as they would schedule work outside the animation frame.
 */
function renderSlowEffects(renderingScheduler) {
    var appSnapshot = renderingScheduler.appSnapshot;
    var renderState = renderingScheduler.renderState;
    var edgeMode = renderState.get('config').get('edgeMode');
    var edgeHeight = renderState.get('config').get('arcHeight');
    var clientMidEdgeInterpolation = renderState.get('config').get('clientMidEdgeInterpolation');
    var numRenderedSplits = renderState.get('config').get('numRenderedSplits');
    var midSpringsPos;
    var midEdgesColors;
    var start;
    var end1, end2, end3, end4;

    var expanded;

    if ( clientMidEdgeInterpolation && appSnapshot.vboUpdated) {
        start = Date.now();

        expanded = expandLogicalEdges(appSnapshot.buffers, numRenderedSplits, edgeHeight);
        midSpringsPos = expanded.midSpringsPos;
        appSnapshot.buffers.midSpringsPos = midSpringsPos;

        // Only setup midedge colors once, or when filtered.
        // Approximates filtering when number of logicalEdges changes.
        var numEdges = midSpringsPos.length / 2 / (numRenderedSplits + 1);
        var expectedNumMidEdgeColors = numEdges * (numRenderedSplits + 1);
        if (!appSnapshot.buffers.midEdgesColors || (appSnapshot.buffers.midEdgesColors.length !== expectedNumMidEdgeColors)) {
            midEdgesColors = getMidEdgeColors(appSnapshot.buffers, numEdges, numRenderedSplits);
            appSnapshot.buffers.midEdgesColors = midEdgesColors;
            renderer.loadBuffers(renderState, {'midEdgeColorsClient': midEdgesColors});
        }

        end1 = Date.now();
        renderer.loadBuffers(renderState, {'midSpringsPos': midSpringsPos});
        renderer.loadBuffers(renderState, {'midSpringsStarts': expanded.midSpringsStarts});
        renderer.loadBuffers(renderState, {'midSpringsEnds': expanded.midSpringsEnds});
        renderer.setNumElements(renderState, 'edgepicking', midSpringsPos.length / 2);
        renderer.setNumElements(renderState, 'midedgeculled', midSpringsPos.length / 2);
        end2 = Date.now();
        console.debug('Edges expanded in', end1 - start, '[ms], and loaded in', end2 - end1, '[ms]');
        makeArrows(appSnapshot.buffers, edgeMode, numRenderedSplits);
        end3 = Date.now();
        renderer.loadBuffers(renderState, {'arrowStartPos': appSnapshot.buffers.arrowStartPos});
        renderer.loadBuffers(renderState, {'arrowEndPos': appSnapshot.buffers.arrowEndPos});
        renderer.loadBuffers(renderState, {'arrowNormalDir': appSnapshot.buffers.arrowNormalDir});
        renderer.loadBuffers(renderState, {'arrowColors': appSnapshot.buffers.arrowColors});
        renderer.loadBuffers(renderState, {'arrowPointSizes': appSnapshot.buffers.arrowPointSizes});

        // numEdges = length / 4 (stored as UInt8) * 0.5 (biDirectional)
        // numArrowElements = 3 * numEdges.
        var numArrowCulled = ((appSnapshot.buffers.logicalEdges.length / 2) / 4) * 3;

        renderer.setNumElements(renderState, 'arrowculled', numArrowCulled);
        end4 = Date.now();

        console.debug('Arrows generated in ', end3 - end2, '[ms], and loaded in', end4 - end3, '[ms]');

    } else if (appSnapshot.vboUpdated) {
        start = Date.now();

        expanded = expandLogicalMidEdges(appSnapshot.buffers);
        midSpringsPos = expanded.midSpringsPos;

        renderer.loadBuffers(renderState, {'midSpringsPos': midSpringsPos});
        renderer.loadBuffers(renderState, {'midSpringsStarts': expanded.midSpringsStarts});
        renderer.loadBuffers(renderState, {'midSpringsEnds': expanded.midSpringsEnds});
        end1 = Date.now();
        renderer.setNumElements(renderState, 'edgepicking', midSpringsPos.length / 2);
        end2 = Date.now();
        console.debug('Edges expanded in', end1 - start, '[ms], and loaded in', end2 - end1, '[ms]');
    }

    renderer.setCamera(renderState);
    renderer.render(renderState, 'fullscene', 'renderSceneFull');
    renderer.render(renderState, 'picking', 'picking', undefined, undefined, function () {
        renderingScheduler.appSnapshot.hitmapUpdates.onNext();
    });
    renderer.copyCanvasToTexture(renderState, 'steadyStateTexture');
}

/*
 * Render mouseover effects. These should only occur during a quiet state.
 *
 */
var lastHighlighted = {edges: [], nodes: []};

// TODO: Make this work on safari.
function renderMouseoverEffects(renderingScheduler, task) {
    var appSnapshot = renderingScheduler.appSnapshot;
    var renderState = renderingScheduler.renderState;
    var buffers = appSnapshot.buffers;
    //var numRenderedSplits = renderState.get('config').get('numRenderedSplits');
    var numRenderedSplits;
    if (buffers.midSpringsPos) {
        numRenderedSplits = ((buffers.midSpringsPos.length / 4) / (buffers.logicalEdges.length / 8)) - 1;
    } else {
        return;
    }
    var numMidEdges = numRenderedSplits + 1;

    // We haven't received any VBOs yet, so we shouldn't attempt to render.
    if (!buffers.logicalEdges) {
        return;
    }

    var logicalEdges = new Uint32Array(buffers.logicalEdges.buffer);
    var hostBuffers = renderState.get('hostBuffersCache');
    var forwardsEdgeStartEndIdxs = new Uint32Array(hostBuffers.forwardsEdgeStartEndIdxs.buffer);

    var edgeIndices = task.data.edgeIndices || [];
    var nodeIndices = task.data.nodeIndices || [];

    // Cheap sets so we don't duplicate edges, but want to avoid using the slow _.uniq
    var seenEdges = {};
    var seenNodes = {};

    _.each(edgeIndices, function (idx) {
        seenEdges[idx] = 1;
    });
    _.each(nodeIndices, function (idx) {
        seenNodes[idx] = 1;
    });

    // Extend edges with neighbors of nodes
    _.each(nodeIndices, function (val) {
        var stride = 2 * val;
        var start = forwardsEdgeStartEndIdxs[stride];
        var end = forwardsEdgeStartEndIdxs[stride + 1];
        while (start < end) {
            var edgeIdx = start;
            if (!seenEdges[edgeIdx]) {
                edgeIndices.push(edgeIdx);
                seenEdges[edgeIdx] = 1;
            }
            start++;
        }
    });

    // Extend node indices with edge endpoints
    // TODO: Decide if we need to dedupe.
    _.each(edgeIndices, function (val) {
        var stride = 2 * val;
        nodeIndices.push(logicalEdges[stride]);
        nodeIndices.push(logicalEdges[stride + 1]);
    });

    var hostNodePositions = new Float32Array(hostBuffers.curPoints.buffer);
    var hostNodeSizes = hostBuffers.pointSizes;
    var hostNodeColors = new Uint32Array(hostBuffers.pointColors.buffer);

    var wrappedHighlighted = {edges: edgeIndices, nodes: nodeIndices};
    // Don't render if nothing has changed
    if (_.isEqual(lastHighlighted, wrappedHighlighted)) {
        return;
    }
    lastHighlighted = wrappedHighlighted;

        // TODO: Start with a small buffer and increase if necessary, masking underlying
        // data so we don't have to clear out later values. This way we won't have to constantly allocate
        buffers.highlightedEdges = new Float32Array(edgeIndices.length * 4 * numMidEdges);
        buffers.highlightedNodePositions = new Float32Array(nodeIndices.length * 2);
        buffers.highlightedNodeSizes = new Uint8Array(nodeIndices.length);
        buffers.highlightedNodeColors = new Uint32Array(nodeIndices.length);
        buffers.highlightedArrowStartPos = new Float32Array(edgeIndices.length * 2 * 3);
        buffers.highlightedArrowEndPos = new Float32Array(edgeIndices.length * 2 * 3);
        buffers.highlightedArrowNormalDir = new Float32Array(edgeIndices.length * 3);
        buffers.highlightedArrowPointColors = new Uint32Array(edgeIndices.length * 3);
        buffers.highlightedArrowPointSizes = new Uint8Array(edgeIndices.length * 3);

        renderer.setNumElements(renderState, 'edgehighlight', edgeIndices.length * 2 * numMidEdges);
        renderer.setNumElements(renderState, 'pointhighlight', nodeIndices.length);
        renderer.setNumElements(renderState, 'arrowhighlight', edgeIndices.length * 3);

        _.each(edgeIndices, function (val, idx) {
            // The start at the first midedge corresponding to hovered edge
            var edgeStartIdx = (val * 4 * numMidEdges);
            var highlightStartIdx = (idx * 4 * numMidEdges);
            for (var midEdgeIdx = 0; midEdgeIdx < numMidEdges; midEdgeIdx = midEdgeIdx + 1) {
                var midEdgeStride = midEdgeIdx * 4;
                buffers.highlightedEdges[highlightStartIdx + midEdgeStride] = buffers.midSpringsPos[edgeStartIdx + (midEdgeStride)];
                buffers.highlightedEdges[highlightStartIdx + midEdgeStride + 1] = buffers.midSpringsPos[edgeStartIdx + (midEdgeStride) + 1];
                buffers.highlightedEdges[highlightStartIdx + midEdgeStride + 2] = buffers.midSpringsPos[edgeStartIdx + (midEdgeStride) + 2];
                buffers.highlightedEdges[highlightStartIdx + midEdgeStride + 3] = buffers.midSpringsPos[edgeStartIdx + (midEdgeStride) + 3];
            }
        });


        _.each(nodeIndices, function (val, idx) {
            buffers.highlightedNodePositions[idx*2] = hostNodePositions[val*2];
            buffers.highlightedNodePositions[idx*2 + 1] = hostNodePositions[val*2 + 1];
            buffers.highlightedNodeSizes[idx] = hostNodeSizes[val];
            buffers.highlightedNodeColors[idx] = hostNodeColors[val];
        });

        populateArrowBuffers(edgeIndices, buffers.midSpringsPos, buffers.highlightedArrowStartPos,
                buffers.highlightedArrowEndPos, buffers.highlightedArrowNormalDir, hostNodeSizes,
                logicalEdges, buffers.highlightedArrowPointSizes, buffers.highlightedArrowPointColors,
                buffers.edgeColors, numRenderedSplits);

        renderer.setupFullscreenBuffer(renderState);
        renderer.loadBuffers(renderState, {
            'highlightedEdgesPos': buffers.highlightedEdges,
            'highlightedPointsPos': buffers.highlightedNodePositions,
            'highlightedPointsSizes': buffers.highlightedNodeSizes,
            'highlightedPointsColors': buffers.highlightedNodeColors,
            'highlightedArrowStartPos': buffers.highlightedArrowStartPos,
            'highlightedArrowEndPos': buffers.highlightedArrowEndPos,
            'highlightedArrowNormalDir': buffers.highlightedArrowNormalDir,
            'highlightedArrowPointColors': buffers.highlightedArrowPointColors,
            'highlightedArrowPointSizes': buffers.highlightedArrowPointSizes
        });
    renderer.setCamera(renderState);
    renderer.render(renderState, 'highlight', 'highlight');
}


var RenderingScheduler = function(renderState, vboUpdates, hitmapUpdates,
                                  isAnimating, simulateOn) {
    var that = this;
    this.renderState = renderState;

    /* Rendering queue */
    var renderTasks = new Rx.Subject();
    var renderQueue = {};
    var renderingPaused = true; // False when the animation loop is running.

    /* Since we cannot read out of Rx streams withing the animation frame, we record the latest
     * value produced by needed rx streams and pass them as function arguments to the quiet state
     * callback. */
    this.appSnapshot = {
        vboUpdated: false,
        simulating: false,
        quietState: false,
        interpolateMidPoints : true,
        //TODO these should be inferred from renderconfig
        buffers: {
            curPoints: undefined,
            curMidPoints: undefined,
            pointSizes: undefined,
            logicalEdges: undefined,
            springsPos: undefined,
            midSpringsPos: undefined,
            midEdgesColors: undefined,
            highlightedEdges: undefined,
            highlightedNodePositions: undefined,
            highlightedNodeSizes: undefined,
            highlightedNodeColors: undefined,
            edgeColors: undefined,
            arrowStartPos: undefined,
            arrowEndPos: undefined,
            arrowNormalDir: undefined,
            arrowColors: undefined,
            arrowPointSizes: undefined,
            highlightedArrowStartPos: undefined,
            highlightedArrowEndPos: undefined,
            highlightedArrowNormalDir: undefined,
            highlightedArrowPointColors: undefined,
            highlightedArrowPointSizes: undefined
        },
        hitmapUpdates: hitmapUpdates
    };

    Object.seal(this.appSnapshot);
    Object.seal(this.appSnapshot.buffers);


    /* Set up fullscreen buffer for mouseover effects.
     *
     */
    renderer.setupFullscreenBuffer(renderState);


    /*
     * Rx hooks to maintain the appSnaphot up-to-date
     */
    simulateOn.subscribe(function (val) {
        that.appSnapshot.simulating = val;
    }, util.makeErrorHandler('simulate updates'));

    vboUpdates.filter(function (status) {
        return status === 'received';
    }).flatMapLatest(function () {
        var hostBuffers = renderState.get('hostBuffers');
        var bufUpdates = ['curPoints', 'logicalEdges', 'edgeColors', 'pointSizes', 'curMidPoints'].map(function (bufName) {
            var bufUpdate = hostBuffers[bufName] || Rx.Observable.return();
            return bufUpdate.do(function (data) {
                that.appSnapshot.buffers[bufName] = data;
            });
        });
        return bufUpdates[0]
            .combineLatest(bufUpdates[1], bufUpdates[2], bufUpdates[3], bufUpdates[4], _.identity);
    }).do(function () {
        that.appSnapshot.vboUpdated = true;
        that.renderScene('vboupdate', {trigger: 'renderSceneFast'});
        that.renderScene('vboupdate_picking', {
            items: ['pointsampling'],
            callback: function () {
                hitmapUpdates.onNext();
            }
        });
    }).subscribe(_.identity, util.makeErrorHandler('render vbo updates'));


    /* Push a render task into the renderer queue
     * String * {trigger, items, readPixels, callback} -> () */
    this.renderScene = function(tag, task) {
        renderTasks.onNext({
            tag: tag,
            trigger: task.trigger,
            items: task.items,
            readPixels: task.readPixels,
            callback: task.callback,
            data: task.data
        });
    };

    /* Move render tasks into a tagged dictionary. For each tag, only the latest task
     * is rendered; others are skipepd. */
    renderTasks.subscribe(function (task) {
        debug('Queueing frame on behalf of', task.tag);
        renderQueue[task.tag] = task;

        if (renderingPaused) {
            startRenderingLoop();
        }
    });


    /*
     * Helpers to start/stop the rendering loop within an animation frame. The rendering loop
     * stops when idle for a second and starts again at the next render update.
     */
    function startRenderingLoop() {
        var lastRenderTime = 0;
        var quietSignaled = true;

        function loop() {
            var nextFrameId = window.requestAnimationFrame(loop);

            // Nothing to render
            if (_.keys(renderQueue).length === 0) {
                var timeDelta = Date.now() - lastRenderTime;
                if (timeDelta > 200 && !quietSignaled) {
                    quietCallback();
                    quietSignaled = true;
                    isAnimating.onNext(false);
                }

                if (timeDelta > 1000) {
                    pauseRenderingLoop(nextFrameId);
                }
                return;
            }

            // Mouseover interactions
            // TODO: Generalize this as a separate category?
            if (_.keys(renderQueue).indexOf('mouseOver') > -1) {
                // TODO: Handle mouseover interaction
                renderMouseoverEffects(that, renderQueue.mouseOver);
                delete renderQueue.mouseOver;
            }

            // Rest render queue
            if (_.keys(renderQueue).length > 0) {
                lastRenderTime = Date.now();
                if (quietSignaled) {
                    isAnimating.onNext(true);
                    quietSignaled = false;
                    that.appSnapshot.quietState = false;
                }

                renderer.setCamera(renderState);
                _.each(renderQueue, function (renderTask, tag) {
                    renderer.render(renderState, tag, renderTask.trigger, renderTask.items,
                                    renderTask.readPixels, renderTask.callback);
                });
                renderQueue = {};
            }
        }

        debug('Starting rendering loop');
        renderingPaused = false;
        loop();
    }

    function pauseRenderingLoop(nextFrameId) {
        debug('Pausing rendering loop');
        window.cancelAnimationFrame(nextFrameId);
        renderingPaused = true;
    }

    /* Called when a quiet/steady state is detected, to render expensive features such as edges */
    function quietCallback() {
        if (!that.appSnapshot.simulating) {
            debug('Quiet state');
            renderSlowEffects(that);
            that.appSnapshot.quietState = true;
            that.appSnapshot.vboUpdated = false;
        }
    }
};


module.exports = {
    setupBackgroundColor: setupBackgroundColor,
    setupCameraInteractions: setupCameraInteractions,
    setupLabelsAndCursor: setupLabelsAndCursor,
    setupRenderUpdates: setupRenderUpdates,
    RenderingScheduler: RenderingScheduler
};

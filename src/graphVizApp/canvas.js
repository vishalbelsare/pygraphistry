'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:canvas');
var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');
var _       = require('underscore');

var interaction     = require('./interaction.js');
var util            = require('./util.js');
var renderer        = require('../renderer');
var colorPicker     = require('./colorpicker.js');
var VizSlice        = require('./VizSlice.js');


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
//Scatter: label each midEdge with containing edge's start/end pos (used for dynamic culling)
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


//Find label position (unadjusted and in model space)
//  Currently just picks a midEdge vertex near the ~middle
//  (In contrast, mouseover effects should use the ~Voronoi position)
//  To convert to canvas coords, use Camera (ex: see labels::renderCursor)
//  TODO use camera if edge goes off-screen
//RenderState * int -> {x: float,  y: float}
function getEdgeLabelPos (appState, edgeIndex) {
    var numRenderedSplits = appState.renderState.get('config').get('numRenderedSplits');
    var split = Math.floor(numRenderedSplits/2);

    var appSnapshot = appState.renderingScheduler.appSnapshot;
    var midSpringsPos = appSnapshot.buffers.midSpringsPos;

    var midEdgesPerEdge = numRenderedSplits + 1;
    var midEdgeStride = 4 * midEdgesPerEdge;
    var idx = midEdgeStride * edgeIndex + 4 * split;

    return {x: midSpringsPos[idx], y: midSpringsPos[idx + 1]};
}


// RenderState
// {logicalEdges: Uint32Array, curPoints: Float32Array, edgeHeights: Float32Array, ?midSpringsPos: Float32Array}
//  * int * float
//  -> {midSpringsPos: Float32Array, midSpringsStarts: Float32Array, midSpringsEnds: Float32Array}
function expandLogicalEdges(renderState, bufferSnapshots, numRenderedSplits, edgeHeight) {


    var logicalEdges = new Uint32Array(bufferSnapshots.logicalEdges.buffer);
    var curPoints = new Float32Array(bufferSnapshots.curPoints.buffer);
    var numEdges = logicalEdges.length / 2;

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

    var setMidEdge = function (edgeIdx, midEdgeIdx, srcMidPointX, srcMidPointY, dstMidPointX, dstMidPointY) {
        var midEdgeStartIdx = edgeIdx * midEdgeStride;
        var index = midEdgeStartIdx + (midEdgeIdx * 4);
        midSpringsPos[index] = srcMidPointX;
        midSpringsPos[index + 1] = srcMidPointY;
        midSpringsPos[index + 2] = dstMidPointX;
        midSpringsPos[index + 3] = dstMidPointY;
    };

    //for each midEdge, start x/y & end x/y
    var midSpringsEndpoints = expandMidEdgeEndpoints(numEdges, numRenderedSplits, logicalEdges, curPoints);

    //TODO have server pre-compute real heights, and use them here
    //var edgeHeights = renderState.get('hostBuffersCache').edgeHeights;
    var srcPointIdx;
    var dstPointIdx;
    var srcPointX;
    var srcPointY;
    var dstPointX;
    var dstPointY;
    var cosArray = new Float32Array(numRenderedSplits);
    var sinArray = new Float32Array(numRenderedSplits);
    var heightCounter = 0;
    var prevSrcIdx = -1;
    var prevDstIdx = -1;
    var edgeSeqLen = 1;
    for (var edgeIndex = 0; edgeIndex < numEdges; edgeIndex += 1) {


        srcPointIdx = logicalEdges[2 * edgeIndex];
        dstPointIdx = logicalEdges[2 * edgeIndex + 1];
        srcPointX = curPoints[2 * srcPointIdx];
        srcPointY = curPoints[2 * srcPointIdx + 1];
        dstPointX = curPoints[2 * dstPointIdx];
        dstPointY = curPoints[2 * dstPointIdx + 1];

        //edgeHeight +/- 50%
        if (prevSrcIdx === srcPointIdx && prevDstIdx === dstPointIdx) {
            heightCounter++;
        } else {
            heightCounter = 0;
            var i;
            for (i = edgeIndex + 1;
                    i < numEdges &&
                    srcPointIdx === logicalEdges[2 * i] &&
                    dstPointIdx === logicalEdges[2 * i + 1];
                    i++) {
            }
            edgeSeqLen = i - edgeIndex + 1;
        }
        prevSrcIdx = srcPointIdx;
        prevDstIdx = dstPointIdx;

        var moduloHeight = edgeHeight * (1.0 + 2 * heightCounter/edgeSeqLen);
        var unitRadius = (1 + Math.pow(moduloHeight, 2)) / (2 * moduloHeight);
        var theta = Math.asin((1 / unitRadius)) * 2;
        var thetaStep = -theta / (numRenderedSplits + 1);
        var curTheta;
        for (var midPointIdx = 0; midPointIdx < numRenderedSplits; midPointIdx++) {
            curTheta = thetaStep * (midPointIdx + 1);
            cosArray[midPointIdx] = Math.cos(curTheta);
            sinArray[midPointIdx] = Math.sin(curTheta);
        }

        var edgeLength =
            srcPointIdx === dstPointIdx ? 1.0
            : Math.sqrt(Math.pow((dstPointX - srcPointX), 2) + Math.pow((dstPointY - srcPointY), 2));

        var height = moduloHeight * (edgeLength / 2);
        var edgeDirectionX = (srcPointX -  dstPointX) / edgeLength;
        var edgeDirectionY = (srcPointY -  dstPointY) / edgeLength;
        var radius = unitRadius * (edgeLength / 2);
        var midPointX = (srcPointX + dstPointX) / 2;
        var midPointY = (srcPointY + dstPointY) / 2;
        var centerPointX = midPointX + (radius - height) * (-1 * edgeDirectionY);
        var centerPointY = midPointY + (radius - height) * (edgeDirectionX);
        var startRadiusX = srcPointIdx === dstPointIdx ? 1.0 : (srcPointX - centerPointX);
        var startRadiusY = srcPointIdx === dstPointIdx ? 1.0 : (srcPointY - centerPointY);

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


    //for each midEdge, start x/y & end x/y
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

// Remember last task in case you need to rerender mouseovers without an update.
// TODO: Structure this so there's no global
var lastMouseoverTask;

/*
 * Render expensive items (eg, edges) when a quiet state is detected. This function is called
 * from within an animation frame and must execute all its work inside it. Callbacks(rx, etc)
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
        //ARCS
        start = Date.now();

        expanded = expandLogicalEdges(renderState, appSnapshot.buffers, numRenderedSplits, edgeHeight);
        midSpringsPos = expanded.midSpringsPos;
        appSnapshot.buffers.midSpringsPos = midSpringsPos;
        appSnapshot.buffers.midSpringsStarts = expanded.midSpringsStarts;
        appSnapshot.buffers.midSpringsEnds = expanded.midSpringsEnds;

        // Only setup midEdge colors once, or when filtered.
        // Approximates filtering when number of logicalEdges changes.
        var numEdges = midSpringsPos.length / 2 / (numRenderedSplits + 1);
        var expectedNumMidEdgeColors = numEdges * (numRenderedSplits + 1);
        if (!appSnapshot.buffers.midEdgesColors || (appSnapshot.buffers.midEdgesColors.length !== expectedNumMidEdgeColors)) {
            midEdgesColors = getMidEdgeColors(appSnapshot.buffers, numEdges, numRenderedSplits);
            appSnapshot.buffers.midEdgesColors = midEdgesColors;
            renderer.loadBuffers(renderState, {'midEdgesColors': midEdgesColors});
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
        //EDGE BUNDLING
        //TODO deprecate/integrate?
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

    // TODO: Make steadyStateTextureDark instead of just doing it in the shader.
    renderer.copyCanvasToTexture(renderState, 'steadyStateTexture');
    renderer.setupFullscreenBuffer(renderState);
    renderMouseoverEffects(renderingScheduler);
}

/*
 * Render mouseover effects. These should only occur during a quiet state.
 *
 */

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

    task = task || lastMouseoverTask;
    if (!task) {
        return;
    }

    // Cache a copy of the task in case we need to execute again with our last task.
    // TODO: Consider restructuring it so that this isn't a stateful function.
    //
    // We need to be careful not to accidentally modify the internals of this cached task.
    // To be safe, we always cache it as a separate copy. Sucks because we need to know its full structure
    // here too, but whatever.
    lastMouseoverTask = {
        trigger: 'mouseOverEdgeHighlight',
        data: {
            highlight: {
                nodeIndices: _.clone(task.data.highlight.nodeIndices),
                edgeIndices: _.clone(task.data.highlight.edgeIndices)
            },
            selected: {
                nodeIndices: _.clone(task.data.selected.nodeIndices),
                edgeIndices: _.clone(task.data.selected.edgeIndices)
            }
        }
    };


    var logicalEdges = new Uint32Array(buffers.logicalEdges.buffer);
    var hostBuffers = renderState.get('hostBuffersCache');
    var forwardsEdgeStartEndIdxs = new Uint32Array(hostBuffers.forwardsEdgeStartEndIdxs.buffer);

    var hostNodePositions = new Float32Array(hostBuffers.curPoints.buffer);
    var hostNodeSizes = hostBuffers.pointSizes;
    var hostNodeColors = new Uint32Array(hostBuffers.pointColors.buffer);

    //////////////////////////////////////////////////////////////////////////
    // Expand highlighted neighborhoods
    //////////////////////////////////////////////////////////////////////////

    var highlightedEdgeIndices = task.data.highlight.edgeIndices || [];
    var highlightedNodeIndices = task.data.highlight.nodeIndices || [];

    var selectedEdgeIndices = task.data.selected.edgeIndices || [];
    var selectedNodeIndices = task.data.selected.nodeIndices || [];

    var initialHighlightLengths = highlightedEdgeIndices.length + highlightedNodeIndices.length;
    var initialSelectedLengths = selectedEdgeIndices.length + selectedNodeIndices.length;

    // TODO: Decide if we need to dedupe these arrays.
    // TODO: Decide a threshold or such to show neighborhoods for large selections.
    if (initialHighlightLengths <= 1) {
        // Extend edges with neighbors of nodes
        // BAD because uses pushes.
        _.each(highlightedNodeIndices, function (val) {
            var stride = 2 * val;
            var start = forwardsEdgeStartEndIdxs[stride];
            var end = forwardsEdgeStartEndIdxs[stride + 1];
            while (start < end) {
                var edgeIdx = start;
                highlightedEdgeIndices.push(edgeIdx);
                start++;
            }
        });

        // Extend node indices with edge endpoints
        _.each(highlightedEdgeIndices, function (val) {
            var stride = 2 * val;
            highlightedNodeIndices.push(logicalEdges[stride]);
            highlightedNodeIndices.push(logicalEdges[stride + 1]);
        });
    }


    //////////////////////////////////////////////////////////////////////////
    // Setup highlight buffers
    //////////////////////////////////////////////////////////////////////////

    renderer.setNumElements(renderState, 'edgehighlight', highlightedEdgeIndices.length * 2 * numMidEdges);
    renderer.setNumElements(renderState, 'pointhighlight', highlightedNodeIndices.length);
    renderer.setNumElements(renderState, 'arrowhighlight', highlightedEdgeIndices.length * 3);

    if (initialHighlightLengths > 0) {
        // TODO: Start with a small buffer and increase if necessary, masking underlying
        // data so we don't have to clear out later values. This way we won't have to constantly allocate
        buffers.highlightedEdges = new Float32Array(highlightedEdgeIndices.length * 4 * numMidEdges);
        buffers.highlightedNodePositions = new Float32Array(highlightedNodeIndices.length * 2);
        buffers.highlightedNodeSizes = new Uint8Array(highlightedNodeIndices.length);
        buffers.highlightedNodeColors = new Uint32Array(highlightedNodeIndices.length);
        buffers.highlightedArrowStartPos = new Float32Array(highlightedEdgeIndices.length * 2 * 3);
        buffers.highlightedArrowEndPos = new Float32Array(highlightedEdgeIndices.length * 2 * 3);
        buffers.highlightedArrowNormalDir = new Float32Array(highlightedEdgeIndices.length * 3);
        buffers.highlightedArrowPointColors = new Uint32Array(highlightedEdgeIndices.length * 3);
        buffers.highlightedArrowPointSizes = new Uint8Array(highlightedEdgeIndices.length * 3);

        // Copy in data
        _.each(highlightedEdgeIndices, function (val, idx) {
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

        _.each(highlightedNodeIndices, function (val, idx) {
            buffers.highlightedNodePositions[idx*2] = hostNodePositions[val*2];
            buffers.highlightedNodePositions[idx*2 + 1] = hostNodePositions[val*2 + 1];
            buffers.highlightedNodeSizes[idx] = hostNodeSizes[val];
            buffers.highlightedNodeColors[idx] = hostNodeColors[val];
        });

        populateArrowBuffers(highlightedEdgeIndices, buffers.midSpringsPos, buffers.highlightedArrowStartPos,
                buffers.highlightedArrowEndPos, buffers.highlightedArrowNormalDir, hostNodeSizes,
                logicalEdges, buffers.highlightedArrowPointSizes, buffers.highlightedArrowPointColors,
                buffers.edgeColors, numRenderedSplits);

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
    }

    //////////////////////////////////////////////////////////////////////////
    // Setup selected buffers
    //////////////////////////////////////////////////////////////////////////

    // TODO: Start with a small buffer and increase if necessary, masking underlying
    // data so we don't have to clear out later values. This way we won't have to constantly allocate

    renderer.setNumElements(renderState, 'edgeselected', selectedEdgeIndices.length * 2 * numMidEdges);
    renderer.setNumElements(renderState, 'pointselected', selectedNodeIndices.length);
    renderer.setNumElements(renderState, 'arrowselected', selectedEdgeIndices.length * 3);

    if (initialSelectedLengths > 0) {

        buffers.selectedEdges = new Float32Array(selectedEdgeIndices.length * 4 * numMidEdges);
        buffers.selectedEdgeStarts = new Float32Array(selectedEdgeIndices.length * 4 * numMidEdges);
        buffers.selectedEdgeEnds = new Float32Array(selectedEdgeIndices.length * 4 * numMidEdges);
        buffers.selectedEdgeColors = new Uint32Array(selectedEdgeIndices.length * 2 * numMidEdges);
        buffers.selectedNodePositions = new Float32Array(selectedNodeIndices.length * 2);
        buffers.selectedNodeSizes = new Uint8Array(selectedNodeIndices.length);
        buffers.selectedNodeColors = new Uint32Array(selectedNodeIndices.length);
        buffers.selectedArrowStartPos = new Float32Array(selectedEdgeIndices.length * 2 * 3);
        buffers.selectedArrowEndPos = new Float32Array(selectedEdgeIndices.length * 2 * 3);
        buffers.selectedArrowNormalDir = new Float32Array(selectedEdgeIndices.length * 3);
        buffers.selectedArrowPointColors = new Uint32Array(selectedEdgeIndices.length * 3);
        buffers.selectedArrowPointSizes = new Uint8Array(selectedEdgeIndices.length * 3);

        // Copy in data
        _.each(selectedEdgeIndices, function (val, idx) {
            // The start at the first midedge corresponding to hovered edge
            var edgeStartIdx = (val * 4 * numMidEdges);
            var highlightStartIdx = (idx * 4 * numMidEdges);
            var edgeColorStartIdx = (val * 2 * numMidEdges);
            var highlightColorStartIdx = (idx * 2 * numMidEdges);
            for (var midEdgeIdx = 0; midEdgeIdx < numMidEdges; midEdgeIdx = midEdgeIdx + 1) {
                var midEdgeStride = midEdgeIdx * 4;
                buffers.selectedEdges[highlightStartIdx + midEdgeStride] = buffers.midSpringsPos[edgeStartIdx + (midEdgeStride)];
                buffers.selectedEdges[highlightStartIdx + midEdgeStride + 1] = buffers.midSpringsPos[edgeStartIdx + (midEdgeStride) + 1];
                buffers.selectedEdges[highlightStartIdx + midEdgeStride + 2] = buffers.midSpringsPos[edgeStartIdx + (midEdgeStride) + 2];
                buffers.selectedEdges[highlightStartIdx + midEdgeStride + 3] = buffers.midSpringsPos[edgeStartIdx + (midEdgeStride) + 3];

                buffers.selectedEdgeStarts[highlightStartIdx + midEdgeStride] = buffers.midSpringsStarts[edgeStartIdx + (midEdgeStride)];
                buffers.selectedEdgeStarts[highlightStartIdx + midEdgeStride + 1] = buffers.midSpringsStarts[edgeStartIdx + (midEdgeStride) + 1];
                buffers.selectedEdgeStarts[highlightStartIdx + midEdgeStride + 2] = buffers.midSpringsStarts[edgeStartIdx + (midEdgeStride) + 2];
                buffers.selectedEdgeStarts[highlightStartIdx + midEdgeStride + 3] = buffers.midSpringsStarts[edgeStartIdx + (midEdgeStride) + 3];

                buffers.selectedEdgeEnds[highlightStartIdx + midEdgeStride] = buffers.midSpringsEnds[edgeStartIdx + (midEdgeStride)];
                buffers.selectedEdgeEnds[highlightStartIdx + midEdgeStride + 1] = buffers.midSpringsEnds[edgeStartIdx + (midEdgeStride) + 1];
                buffers.selectedEdgeEnds[highlightStartIdx + midEdgeStride + 2] = buffers.midSpringsEnds[edgeStartIdx + (midEdgeStride) + 2];
                buffers.selectedEdgeEnds[highlightStartIdx + midEdgeStride + 3] = buffers.midSpringsEnds[edgeStartIdx + (midEdgeStride) + 3];

                var midEdgeColorStride = midEdgeIdx * 2;
                buffers.selectedEdgeColors[highlightColorStartIdx + midEdgeColorStride] = buffers.midEdgesColors[edgeColorStartIdx + midEdgeColorStride];
                buffers.selectedEdgeColors[highlightColorStartIdx + midEdgeColorStride + 1] = buffers.midEdgesColors[edgeColorStartIdx + midEdgeColorStride + 1];
            }
        });

        _.each(selectedNodeIndices, function (val, idx) {
            buffers.selectedNodePositions[idx*2] = hostNodePositions[val*2];
            buffers.selectedNodePositions[idx*2 + 1] = hostNodePositions[val*2 + 1];
            buffers.selectedNodeSizes[idx] = hostNodeSizes[val];
            buffers.selectedNodeColors[idx] = hostNodeColors[val];
        });

        populateArrowBuffers(selectedEdgeIndices, buffers.midSpringsPos, buffers.selectedArrowStartPos,
                buffers.selectedArrowEndPos, buffers.selectedArrowNormalDir, hostNodeSizes,
                logicalEdges, buffers.selectedArrowPointSizes, buffers.selectedArrowPointColors,
                buffers.edgeColors, numRenderedSplits);

        renderer.loadBuffers(renderState, {
            'selectedMidSpringsPos': buffers.selectedEdges,
            'selectedMidEdgesColors': buffers.selectedEdgeColors,
            'selectedMidSpringsStarts': buffers.selectedEdgeStarts,
            'selectedMidSpringsEnds': buffers.selectedEdgeEnds,
            'selectedCurPoints': buffers.selectedNodePositions,
            'selectedPointSizes': buffers.selectedNodeSizes,
            'selectedPointColors': buffers.selectedNodeColors,
            'selectedArrowStartPos': buffers.selectedArrowStartPos,
            'selectedArrowEndPos': buffers.selectedArrowEndPos,
            'selectedArrowNormalDir': buffers.selectedArrowNormalDir,
            'selectedArrowColors': buffers.selectedArrowPointColors,
            'selectedArrowPointSizes': buffers.selectedArrowPointSizes
        });

    }

    //////////////////////////////////////////////////////////////////////////
    // Handle Rendering + Texture backdrop.
    //////////////////////////////////////////////////////////////////////////

    var shouldDarken = selectedEdgeIndices.length > 0 || selectedNodeIndices.length > 0;
    var renderTrigger = shouldDarken ? 'highlightDark' : 'highlight';

    renderer.setCamera(renderState);
    renderer.render(renderState, renderTrigger, renderTrigger);
}


function RenderingScheduler (renderState, vboUpdates, hitmapUpdates,
                                  isAnimating, simulateOn, activeSelection) {
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

        //{ <activeBufferName> -> undefined}
        // Seem to be client-defined local buffers
        buffers:
            _.object(
                renderer.getBufferNames(renderState.get('config').toJS())
                .concat(
                    //TODO move client-only into render.config dummies when more sane
                    ['highlightedEdges', 'highlightedNodePositions', 'highlightedNodeSizes', 'highlightedNodeColors',
                     'highlightedArrowStartPos', 'highlightedArrowEndPos', 'highlightedArrowNormalDir',
                     'highlightedArrowPointColors', 'highlightedArrowPointSizes', 'selectedEdges', 'selectedNodePositions', 'selectedNodeSizes', 'selectedNodeColors',
                     'selectedArrowStartPos', 'selectedArrowEndPos', 'selectedArrowNormalDir',
                     'selectedArrowPointColors', 'selectedArrowPointSizes', 'selectedEdgeColors', 'selectedEdgeEnds', 'selectedEdgeStarts'])
                .map(function (v) { return [v, undefined]; })),

        hitmapUpdates: hitmapUpdates
    };

    Object.seal(this.appSnapshot);
    Object.seal(this.appSnapshot.buffers);


    /* Set up fullscreen buffer for mouseover effects.
     *
     */
    renderer.setupFullscreenBuffer(renderState);


    /*
     * Rx hooks to maintain the appSnapshot up-to-date
     */
    simulateOn.subscribe(function (val) {
        that.appSnapshot.simulating = val;
    }, util.makeErrorHandler('simulate updates'));

    vboUpdates.filter(function (status) {
        return status === 'received';
    }).flatMapLatest(function () {
        var hostBuffers = renderState.get('hostBuffers');
        // FIXME handle selection update buffers here.
        Rx.Observable.combineLatest(hostBuffers.selectedPointIndexes, hostBuffers.selectedEdgeIndexes,
            function (pointIndexes, edgeIndexes) {
                activeSelection.onNext(new VizSlice({point: pointIndexes, edge: edgeIndexes}));
            }).take(1).subscribe(_.identity, util.makeErrorHandler('Getting indexes of selections.'));
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
     * is rendered; others are skipped. */
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
                if (timeDelta > 75 && !quietSignaled) {
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

                // If anything is selected, we need to do the copy to texture + darken
                // TODO: Investigate performance of this.
                if (lastMouseoverTask &&
                        (lastMouseoverTask.data.selected.nodeIndices.length + lastMouseoverTask.data.selected.edgeIndices.length > 0)
                ) {
                    renderer.copyCanvasToTexture(renderState, 'steadyStateTexture');
                    renderer.setupFullscreenBuffer(renderState);
                    renderMouseoverEffects(that);
                }

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
}


module.exports = {
    setupBackgroundColor: setupBackgroundColor,
    setupCameraInteractions: setupCameraInteractions,
    setupRenderUpdates: setupRenderUpdates,
    RenderingScheduler: RenderingScheduler,
    getEdgeLabelPos: getEdgeLabelPos
};

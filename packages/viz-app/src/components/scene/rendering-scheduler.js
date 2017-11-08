'use strict';

const _ = require('underscore');
const debug = require('debug')('graphistry:StreamGL:graphVizApp:canvas');

import { Observable, Subscription, Subject } from 'rxjs';
import Color from 'color';

import { isDark } from '../labels/label';

RenderingScheduler.prototype = Object.create(Subscription.prototype);

function RenderingScheduler(
    renderState,
    renderer,
    vboUpdates,
    vboVersions,
    hitmapUpdates,
    isAnimating,
    simulateOn,
    hints
) {
    Subscription.call(this);

    this.renderer = renderer;
    this.renderState = renderState;
    this.arrayBuffers = {};
    // Remember last task in case you need to rerender mouseovers without an update.
    this.lastMouseoverTask = undefined;

    var config = renderState.config;
    this.attemptToAllocateBuffersOnHints(config, renderState, hints);

    /* Rendering queue */
    var renderTasks = new Subject();
    var renderQueue = Object.create(null);
    var renderingPaused = true; // False when the animation loop is running.

    var fullBufferNameList = config.buffers.concat(
        //TODO move client-only into render.config dummies when more sane
        [
            'highlightedEdges',
            'highlightedNodePositions',
            'highlightedNodeSizes',
            'highlightedNodeColors',
            'highlightedArrowStartPos',
            'highlightedArrowEndPos',
            'highlightedArrowNormalDir',
            'highlightedArrowPointColors',
            'highlightedArrowPointSizes',
            'selectedEdges',
            'selectedNodePositions',
            'selectedNodeSizes',
            'selectedNodeColors',
            'selectedArrowStartPos',
            'selectedArrowEndPos',
            'selectedArrowNormalDir',
            'selectedArrowPointColors',
            'selectedArrowPointSizes',
            'selectedEdgeColors',
            'selectedEdgeEnds',
            'selectedEdgeStarts'
        ]
    );

    /* Since we cannot read out of Rx streams within the animation frame, we record the latest
     * value produced by needed rx streams and pass them as function arguments to the quiet state
     * callback. */
    this.appSnapshot = {
        vboUpdated: false,
        simulating: false,
        quietState: false,
        interpolateMidPoints: true,
        fullScreenBufferDirty: true,

        //{ <activeBufferName> -> undefined}
        // Seem to be client-defined local buffers
        buffers: _.object(
            fullBufferNameList.map(function(v) {
                return [v, undefined];
            })
        ),

        bufferComputedVersions: _.object(
            fullBufferNameList.map(function(v) {
                return [v, -1];
            })
        ),

        bufferReceivedVersions: _.object(
            fullBufferNameList.map(function(v) {
                return [v, -1];
            })
        ),

        hitmapUpdates: hitmapUpdates
    };

    Object.seal(this.appSnapshot);
    Object.seal(this.appSnapshot.buffers);

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

    /*
     * Set up fullscreen buffer for mouseover effects.
     */
    renderer.setupFullscreenBuffer(renderState);

    var hostBuffersCache = renderState.hostBuffersCache;

    this.add(
        vboUpdates
            .filter(status => status === 'received')
            .zip(vboVersions, (x, y) => y)
            .combineLatest(simulateOn)
            .do(([vboVersions, simulateIsOn]) => {
                const { buffers, bufferReceivedVersions } = this.appSnapshot;

                _.each(vboVersions, buffersByType => {
                    _.each(buffersByType, (versionNumber, name) => {
                        bufferReceivedVersions[name] = versionNumber;
                    });
                });

                buffers.curPoints = hostBuffersCache.curPoints;
                buffers.pointSizes = hostBuffersCache.pointSizes;
                buffers.edgeColors = hostBuffersCache.edgeColors;
                buffers.logicalEdges = hostBuffersCache.logicalEdges;

                // TODO: This can end up firing renderSceneFull multiple times at the end of
                // a simulation session, since multiple VBOs will continue to come in
                // while simulateIsOn = false
                this.appSnapshot.vboUpdated = true;

                this.renderScene('vboupdate', {
                    trigger: simulateIsOn ? 'renderSceneFast' : 'renderSceneFull'
                });
                this.renderScene('vboupdate_picking', {
                    items: ['pointsampling'],
                    callback: () => {
                        hitmapUpdates.onNext();
                    }
                });
            })
            .subscribe({})
    );

    var PAUSE_RENDERING_DELAY = 500;

    var lastRenderTime = 0;
    var quietSignaled = false;
    var quietRenderQueue = Object.create(null);

    // Communication between render loops about whether to update lastRenderTime,
    // or to check the delta against it to see if we should render slow effects.
    var shouldUpdateRenderTime = true;

    const loop = () => {
        let renderTaskNames = Object.keys(renderQueue);

        // Nothing to render
        if (renderTaskNames.length === 0) {
            // TODO: Generalize this
            if (!quietSignaled) {
                quietSignaled = true;
                isAnimating.onNext(false);
            }

            if (shouldUpdateRenderTime) {
                // Just update render time, leave delta checks for next loop
                lastRenderTime = Date.now();
                shouldUpdateRenderTime = false;
            } else {
                // Check time since last render. Based on duration, pause the rendering loop.
                var timeDelta = Date.now() - lastRenderTime;
                if (timeDelta > PAUSE_RENDERING_DELAY) {
                    let tag;
                    for (tag in quietRenderQueue) {
                        renderQueue[tag] = quietRenderQueue[tag];
                    }
                    // A fun way to check whether the `quietRenderQueue` enumerated any elements.
                    // - If not, pause the rendering loop.
                    // - If so, loop around again to render slow things.
                    if (tag === undefined) {
                        return pauseRenderingLoop();
                    }
                    quietRenderQueue = Object.create(null);
                }
            }
            return requestAnimationFrame(loop);
        }

        renderer.setCamera(renderState);

        // Handle "slow effects request"
        // TODO: Handle this naturally, instead of hack here
        var handledSpecialTasks = false;
        var tagsWithRenderFull = renderTaskNames.filter(
            key => renderQueue[key].trigger === 'renderSceneFull'
        );

        if (tagsWithRenderFull.length > 0) {
            // TODO: Generalize this code block
            handledSpecialTasks = true;
            shouldUpdateRenderTime = true;
            this.appSnapshot.fullScreenBufferDirty = true;
            if (quietSignaled) {
                this.renderSlowEffects();
                this.appSnapshot.vboUpdated = false;
            }
            for (let i = -1, n = tagsWithRenderFull.length; ++i < n; ) {
                const tag = tagsWithRenderFull[i];
                !quietSignaled && (quietRenderQueue[tag] = renderQueue[tag]);
                delete renderQueue[tag];
            }
        }

        // Move points overlay
        // Takes precedence over mouseover interactions, and will skip mouseover
        // interactions
        if ('movePointsOverlay' in renderQueue) {
            if (!this.appSnapshot.fullScreenBufferDirty) {
                shouldUpdateRenderTime = true;
                this.renderMovePointsOverlay(renderQueue.movePointsOverlay);
            }
            handledSpecialTasks = true;
            delete renderQueue.mouseOver;
            delete renderQueue.movePointsOverlay;
        } else if ('mouseOver' in renderQueue) {
            // Mouseover
            // TODO: Generalize this as a separate category?
            // Only handle mouseovers if the fullscreen buffer
            // from rendering all edges (full scene) is clean
            if (!this.appSnapshot.fullScreenBufferDirty) {
                shouldUpdateRenderTime = true;
                this.renderMouseoverEffects(renderQueue.mouseOver);
            }
            handledSpecialTasks = true;
            delete renderQueue.mouseOver;
        }

        handledSpecialTasks && (renderTaskNames = Object.keys(renderQueue));

        // Rest of render queue
        if (renderTaskNames.length > 0) {
            let isRenderingToScreen = false;

            // TODO: Generalize this into tag description (or allow to check renderconfig)
            // Alternatively, generalize when we fix the fullScreenBuffer.
            for (let i = -1, n = renderTaskNames.length; ++i < n; ) {
                const taskName = renderTaskNames[i];
                // TODO: Generalize this code block
                if (taskName.indexOf('picking') === -1) {
                    isRenderingToScreen = true;
                    shouldUpdateRenderTime = true;
                    this.appSnapshot.fullScreenBufferDirty = true;
                    if (quietSignaled) {
                        quietSignaled = false;
                        isAnimating.onNext(true);
                    }
                    break;
                }
            }

            for (let i = -1, n = renderTaskNames.length; ++i < n; ) {
                const taskName = renderTaskNames[i];
                const renderTask = renderQueue[taskName];
                delete renderQueue[taskName];
                renderer.render(
                    renderState,
                    taskName,
                    renderTask.trigger,
                    renderTask.items,
                    renderTask.readPixels,
                    renderTask.callback
                );
            }

            // If anything is selected, we need to do the copy to texture + darken
            // TODO: Investigate performance of this.
            if (
                isRenderingToScreen &&
                this.lastMouseoverTask &&
                this.lastMouseoverTask.data.selected.nodeIndices.length +
                    this.lastMouseoverTask.data.selected.edgeIndices.length >
                    0
            ) {
                renderer.copyCanvasToTexture(renderState, 'steadyStateTexture');
                renderer.setupFullscreenBuffer(renderState);

                // Temporarily reset the highlighted node and edge indicies.
                // Without this, the highlights seem to be stuck in place.
                var tmpHighlightNodeIndices = this.lastMouseoverTask.data.highlight.nodeIndices;
                var tmpHighlightEdgeIndices = this.lastMouseoverTask.data.highlight.edgeIndices;
                this.lastMouseoverTask.data.highlight.nodeIndices = [];
                this.lastMouseoverTask.data.highlight.edgeIndices = [];

                this.renderMouseoverEffects();
                this.lastMouseoverTask.data.highlight.nodeIndices = tmpHighlightNodeIndices;
                this.lastMouseoverTask.data.highlight.edgeIndices = tmpHighlightEdgeIndices;
            }
        }
        requestAnimationFrame(loop);
    };

    /*
     * Helpers to start/stop the rendering loop within an animation frame. The rendering loop
     * stops when idle for a second and starts again at the next render update.
     */
    function startRenderingLoop() {
        debug('Starting rendering loop');
        renderingPaused = false;
        requestAnimationFrame(loop);
    }

    function pauseRenderingLoop() {
        debug('Pausing rendering loop');
        renderingPaused = true;
    }

    /* Move render tasks into a tagged dictionary. For each tag, only the latest task
     * is rendered; others are skipped. */
    this.add(
        renderTasks.subscribe(function(task) {
            renderQueue[task.tag] = task;
            if (renderingPaused) {
                debug('Queueing frame on behalf of', task.tag);
                startRenderingLoop();
            }
        })
    );
}

// Hook to preallocate memory when initial sizes are available.
// We handle these by putting them into an subject and handling
// each with a 1ms delay in between, to give the JS thread
// some breathing room to handle other callbacks/repaints.
RenderingScheduler.prototype.attemptToAllocateBuffersOnHints = function(
    config,
    renderState,
    { edges = 0, points = 0 } = {}
) {
    const { numHintElements = {} } = this;

    if (numHintElements.edges === edges && numHintElements.points === points) {
        return;
    }

    if (edges === 0 && points === 0) {
        return;
    }

    const { hintsAllocationCycle } = this;

    if (hintsAllocationCycle) {
        this.remove(hintsAllocationCycle);
        hintsAllocationCycle.unsubscribe();
        return;
    }

    const renderer = this.renderer;
    const timeoutLength = 1;
    const MAX_SIZE_TO_ALLOCATE = 2000000;

    edges = Math.min(edges, MAX_SIZE_TO_ALLOCATE);
    points = Math.min(points, MAX_SIZE_TO_ALLOCATE);

    const numElements = {
        edges,
        points,
        renderedSplits: config.numRenderedSplits
    };

    this.numHintElements = numElements;

    const activeIndices = renderState.activeIndices;
    const largestModel = this.getLargestModelSize(config, numElements);
    const maxElements = Math.max(_.max(_.values(numElements)), largestModel);
    const allocationFunctions = this.allocateAllArrayBuffersFactory(
        config,
        numElements,
        renderState
    );

    this.add(
        (this.hintsAllocationCycle = Observable.from(
            allocationFunctions.concat(
                activeIndices.map(index =>
                    renderer.updateIndexBuffer.bind('', renderState, maxElements, index)
                )
            )
        )
            .concatMap(allocationFunction => {
                // Do one big job, then increment
                allocationFunction();
                // Cede control to browser, then handle next element
                return Observable.timer(timeoutLength).take(1);
            })
            .subscribe(null, null, () => {
                debug('Finished allocating buffers for hints', numElements);
            }))
    );
};

//int * int * Int32Array * Float32Array -> {starts: Float32Array, ends: Float32Array}
//Scatter: label each midEdge with containing edge's start/end pos (used for dynamic culling)
RenderingScheduler.prototype.expandMidEdgeEndpoints = function(
    numEdges,
    numRenderedSplits,
    logicalEdges,
    curPoints
) {
    // var starts = new Float32Array(numEdges * (numRenderedSplits + 1) * 4);
    // var ends = new Float32Array(numEdges * (numRenderedSplits + 1) * 4);

    var starts = this.getTypedArray(
        'midSpringsStarts',
        Float32Array,
        numEdges * (numRenderedSplits + 1) * 4
    );
    var ends = this.getTypedArray(
        'midSpringsEnds',
        Float32Array,
        numEdges * (numRenderedSplits + 1) * 4
    );

    var offset = 0;

    for (var edgeIndex = 0; edgeIndex < numEdges; edgeIndex++) {
        var srcPointIdx = logicalEdges[edgeIndex * 2] * 2;
        var dstPointIdx = logicalEdges[edgeIndex * 2 + 1] * 2;
        var srcPointX = curPoints[srcPointIdx];
        var srcPointY = curPoints[srcPointIdx + 1];
        var dstPointX = curPoints[dstPointIdx];
        var dstPointY = curPoints[dstPointIdx + 1];

        for (var midPointIdx = 0; midPointIdx < numRenderedSplits + 1; midPointIdx++) {
            starts[offset] = srcPointX;
            starts[offset + 1] = srcPointY;
            starts[offset + 2] = srcPointX;
            starts[offset + 3] = srcPointY;
            ends[offset] = dstPointX;
            ends[offset + 1] = dstPointY;
            ends[offset + 2] = dstPointX;
            ends[offset + 3] = dstPointY;
            offset += 4;
        }
    }

    return { starts: starts, ends: ends };
};

//[ srcIdx, dstIdx, ... ] -> { bundleLens: Uint32Array, bundleEntry: Uint32Array }
// Identify multiedges: For each edge, # multiedges in its group, and its index in that list
// ~50ms-100ms on a big graph
function computeEdgeBundles(logicalEdges) {
    const numEdges = logicalEdges.length / 2;

    const numInBundle = new Uint32Array(numEdges);
    const bundleEntry = new Uint32Array(numEdges);

    //TODO this is data that could have been sent from the server, and stable between filters
    // or locally avoidable if the array was sorted
    const src2dstCounts = {};
    for (let edgeIndex = 0; edgeIndex < numEdges; edgeIndex++) {
        const srcPointIdx = logicalEdges[2 * edgeIndex];
        const dstPointIdx = logicalEdges[2 * edgeIndex + 1];
        const dstCounts = (src2dstCounts[srcPointIdx] = src2dstCounts[srcPointIdx] || {});
        dstCounts[dstPointIdx] = (dstCounts[dstPointIdx] || 0) + 1;
    }

    const src2dstCountsRolling = {};
    for (let edgeIndex = 0; edgeIndex < numEdges; edgeIndex++) {
        const srcPointIdx = logicalEdges[2 * edgeIndex];
        const dstPointIdx = logicalEdges[2 * edgeIndex + 1];
        const dstCounts = (src2dstCountsRolling[srcPointIdx] =
            src2dstCountsRolling[srcPointIdx] || {});
        const bundleIndex = (dstCounts[dstPointIdx] = dstCounts[dstPointIdx] + 1 || 0);

        const bundleLen = src2dstCounts[srcPointIdx][dstPointIdx];

        numInBundle[edgeIndex] = bundleLen;
        bundleEntry[edgeIndex] = bundleIndex;
    }

    return { numInBundle, bundleEntry };
}

function setMidEdge(
    edgeIdx,
    midEdgeIdx,
    srcMidPointX,
    srcMidPointY,
    dstMidPointX,
    dstMidPointY,
    midEdgeStride,
    midSpringsPos
) {
    var midEdgeStartIdx = edgeIdx * midEdgeStride;
    var index = midEdgeStartIdx + midEdgeIdx * 4;
    midSpringsPos[index] = srcMidPointX;
    midSpringsPos[index + 1] = srcMidPointY;
    midSpringsPos[index + 2] = dstMidPointX;
    midSpringsPos[index + 3] = dstMidPointY;
}

//For edge bundles of same size, memoize height geometry per edge
//  -- also fill in cosArray, sinArray (for examplars)
//TODO memoize across calls by preserving cosArray/sinArray
function updateEdgeCache({
    numEdges,
    numInBundle,
    bundleEntry,
    edgeHeight,
    numRenderedSplits,
    cosArray,
    sinArray
}) {
    const edgeCache = {};

    for (let edgeIndex = 0; edgeIndex < numEdges; edgeIndex++) {
        const bundleLen = numInBundle[edgeIndex];
        const edgeNum = bundleEntry[edgeIndex];

        if (!edgeCache[bundleLen]) {
            edgeCache[bundleLen] = [];
        }
        if (!edgeCache[bundleLen][edgeNum]) {
            const curveArrayOffset = edgeIndex * numRenderedSplits;
            const moduloHeight = edgeHeight * (1.0 + 2 * edgeNum / bundleLen);
            const unitRadius = (1 + Math.pow(moduloHeight, 2)) / (2 * moduloHeight);
            const theta = Math.asin(1 / unitRadius) * 2;
            const thetaStep = -theta / (numRenderedSplits + 1);
            for (let midPointIdx = 0; midPointIdx < numRenderedSplits; midPointIdx++) {
                const curTheta = thetaStep * (midPointIdx + 1);
                cosArray[curveArrayOffset + midPointIdx] = Math.cos(curTheta);
                sinArray[curveArrayOffset + midPointIdx] = Math.sin(curTheta);
            }
            edgeCache[bundleLen][edgeNum] = { moduloHeight, unitRadius, curveArrayOffset };
        }
    }

    return edgeCache;
}

// RenderState
// {logicalEdges: Uint32Array, curPoints: Float32Array, edgeHeights: Float32Array, ?midSpringsPos: Float32Array}
//  * int * float
//  -> {midSpringsPos: Float32Array, midSpringsStarts: Float32Array, midSpringsEnds: Float32Array}
RenderingScheduler.prototype.expandLogicalEdges = function(
    renderState,
    bufferSnapshots,
    numRenderedSplits,
    edgeHeight
) {
    const logicalEdges = new Uint32Array(bufferSnapshots.logicalEdges.buffer);
    const curPoints = new Float32Array(bufferSnapshots.curPoints.buffer);

    const numEdges = logicalEdges.length / 2;

    const numVertices = 2 * numEdges * (numRenderedSplits + 1);

    bufferSnapshots.midSpringsPos = this.getTypedArray(
        'midSpringsPos',
        Float32Array,
        numVertices * 2
    );

    const midSpringsPos = bufferSnapshots.midSpringsPos;
    const midEdgesPerEdge = numRenderedSplits + 1;
    const midEdgeStride = 4 * midEdgesPerEdge;

    //for each midEdge, start x/y & end x/y
    const midSpringsEndpoints = this.expandMidEdgeEndpoints(
        numEdges,
        numRenderedSplits,
        logicalEdges,
        curPoints
    );

    const { numInBundle, bundleEntry } = computeEdgeBundles(logicalEdges);

    //~50-100ms on a big graph
    const cosArray = new Float32Array(numRenderedSplits * numEdges);
    const sinArray = new Float32Array(numRenderedSplits * numEdges);
    const edgeCache = updateEdgeCache({
        numEdges,
        numInBundle,
        bundleEntry,
        edgeHeight,
        numRenderedSplits,
        cosArray,
        sinArray
    });

    //~50-100ms on a big graph
    for (let edgeIndex = 0; edgeIndex < numEdges; edgeIndex++) {
        /////////////

        const srcPointIdx = logicalEdges[2 * edgeIndex];
        const dstPointIdx = logicalEdges[2 * edgeIndex + 1];
        const srcPointX = curPoints[2 * srcPointIdx];
        const srcPointY = curPoints[2 * srcPointIdx + 1];
        const dstPointX = curPoints[2 * dstPointIdx];
        const dstPointY = curPoints[2 * dstPointIdx + 1];

        const edgeNum = bundleEntry[edgeIndex];
        const bundleLen = numInBundle[edgeIndex];

        /////////////

        const { moduloHeight, unitRadius, curveArrayOffset } = edgeCache[bundleLen][edgeNum];

        /////////////

        const edgeLength =
            srcPointIdx === dstPointIdx
                ? 1.0
                : Math.sqrt(
                      Math.pow(dstPointX - srcPointX, 2) + Math.pow(dstPointY - srcPointY, 2)
                  );

        const height = moduloHeight * (edgeLength / 2);
        const edgeDirectionX = (srcPointX - dstPointX) / edgeLength;
        const edgeDirectionY = (srcPointY - dstPointY) / edgeLength;
        const radius = unitRadius * (edgeLength / 2);
        const midPointX = (srcPointX + dstPointX) / 2;
        const midPointY = (srcPointY + dstPointY) / 2;
        const centerPointX = midPointX + (radius - height) * (-1 * edgeDirectionY);
        const centerPointY = midPointY + (radius - height) * edgeDirectionX;
        const startRadiusX = srcPointIdx === dstPointIdx ? 1.0 : srcPointX - centerPointX;
        const startRadiusY = srcPointIdx === dstPointIdx ? 1.0 : srcPointY - centerPointY;

        let prevPointX = srcPointX;
        let prevPointY = srcPointY;

        for (let midPointIdx = 0; midPointIdx < numRenderedSplits; midPointIdx++) {
            const cos = cosArray[curveArrayOffset + midPointIdx];
            const sin = sinArray[curveArrayOffset + midPointIdx];
            const nextPointX = centerPointX + cos * startRadiusX - sin * startRadiusY;
            const nextPointY = centerPointY + sin * startRadiusX + cos * startRadiusY;
            setMidEdge(
                edgeIndex,
                midPointIdx,
                prevPointX,
                prevPointY,
                nextPointX,
                nextPointY,
                midEdgeStride,
                midSpringsPos
            );
            prevPointX = nextPointX;
            prevPointY = nextPointY;
        }
        setMidEdge(
            edgeIndex,
            numRenderedSplits,
            prevPointX,
            prevPointY,
            dstPointX,
            dstPointY,
            midEdgeStride,
            midSpringsPos
        );
    }

    return {
        midSpringsPos: midSpringsPos,
        midSpringsStarts: midSpringsEndpoints.starts,
        midSpringsEnds: midSpringsEndpoints.ends
    };
};

RenderingScheduler.prototype.expandLogicalMidEdges = function(bufferSnapshots) {
    var logicalEdges = new Uint32Array(bufferSnapshots.logicalEdges.buffer);
    var curMidPoints = new Float32Array(bufferSnapshots.curMidPoints.buffer);
    var curPoints = new Float32Array(bufferSnapshots.curPoints.buffer);
    var numSplits = curMidPoints.length / logicalEdges.length;

    if (numSplits < 1) {
        numSplits = 0;
    }
    //var numMidEdges = numSplits + 1;
    var numEdges = logicalEdges.length / 2;

    var numVertices = 2 * numEdges * (numSplits + 1);

    //for each midEdge, start x/y & end x/y
    var midSpringsEndpoints = this.expandMidEdgeEndpoints(
        numEdges,
        numSplits,
        logicalEdges,
        curPoints
    );

    bufferSnapshots.midSpringsPos = this.getTypedArray(
        'midSpringsPos',
        Float32Array,
        numVertices * 2
    );
    var midSpringsPos = bufferSnapshots.midSpringsPos;

    for (var edgeIndex = 0; edgeIndex < numEdges; edgeIndex += 1) {
        var srcPointIdx = logicalEdges[edgeIndex * 2];
        var dstPointIdx = logicalEdges[edgeIndex * 2 + 1];

        var srcPointX = curPoints[2 * srcPointIdx];
        var srcPointY = curPoints[2 * srcPointIdx + 1];
        //var srcPoint = [srcPointX, srcPointY];
        var dstPointX = curPoints[2 * dstPointIdx];
        var dstPointY = curPoints[2 * dstPointIdx + 1];

        var elementsPerPoint = 2;
        var pointsPerEdge = 2;
        var midEdgesPerEdge = numSplits + 1;
        var midEdgeStride = elementsPerPoint * pointsPerEdge * midEdgesPerEdge;
        var midEdgeStartIdx = edgeIndex * midEdgeStride;

        midSpringsPos[midEdgeStartIdx] = srcPointX;
        midSpringsPos[midEdgeStartIdx + 1] = srcPointY;
        var prevX = srcPointX;
        var prevY = srcPointY;

        for (var midEdgeIdx = 0; midEdgeIdx < numSplits; midEdgeIdx++) {
            midSpringsPos[midEdgeStartIdx + midEdgeIdx * 4] = prevX;
            midSpringsPos[midEdgeStartIdx + midEdgeIdx * 4 + 1] = prevY;

            prevX = curMidPoints[edgeIndex * 2 * numSplits + midEdgeIdx * 2];
            prevY = curMidPoints[edgeIndex * 2 * numSplits + midEdgeIdx * 2 + 1];

            midSpringsPos[midEdgeStartIdx + midEdgeIdx * 4 + 2] = prevX;
            midSpringsPos[midEdgeStartIdx + midEdgeIdx * 4 + 3] = prevY;
        }
        midSpringsPos[(edgeIndex + 1) * midEdgeStride - 4] = prevX;
        midSpringsPos[(edgeIndex + 1) * midEdgeStride - 3] = prevY;

        midSpringsPos[(edgeIndex + 1) * midEdgeStride - 2] = dstPointX;
        midSpringsPos[(edgeIndex + 1) * midEdgeStride - 1] = dstPointY;
    }

    return {
        midSpringsPos: midSpringsPos,
        midSpringsStarts: midSpringsEndpoints.starts,
        midSpringsEnds: midSpringsEndpoints.ends
    };
};

/* Populate arrow buffers. The first argument is either an array of indices,
 * or an integer value of how many you want.
 */
RenderingScheduler.prototype.populateArrowBuffers = function(
    maybeIterable,
    midSpringsPos,
    arrowStartPos,
    arrowEndPos,
    arrowNormalDir,
    pointSizes,
    logicalEdges,
    arrowPointSizes,
    arrowColors,
    edgeColors,
    numRenderedSplits
) {
    var edgeColors32 = new Uint32Array(edgeColors.buffer);

    var numMidEdges = numRenderedSplits + 1;

    var isIterable = maybeIterable.constructor === Array;
    var forLimit = isIterable ? maybeIterable.length : maybeIterable;

    //var start = new Float32Array(2);
    //var end = new Float32Array(2);
    var startX, startY, endX, endY;
    for (var idx = 0; idx < forLimit; idx++) {
        var val = isIterable ? maybeIterable[idx] : idx;

        var midEdgeIdx = (val + 1) * (numMidEdges * 4) - 4;
        startX = midSpringsPos[midEdgeIdx + 0];
        startY = midSpringsPos[midEdgeIdx + 1];
        endX = midSpringsPos[midEdgeIdx + 2];
        endY = midSpringsPos[midEdgeIdx + 3];

        arrowStartPos[6 * idx + 0] = startX;
        arrowStartPos[6 * idx + 1] = startY;
        arrowStartPos[6 * idx + 2] = startX;
        arrowStartPos[6 * idx + 3] = startY;
        arrowStartPos[6 * idx + 4] = startX;
        arrowStartPos[6 * idx + 5] = startY;

        arrowEndPos[6 * idx + 0] = endX;
        arrowEndPos[6 * idx + 1] = endY;
        arrowEndPos[6 * idx + 2] = endX;
        arrowEndPos[6 * idx + 3] = endY;
        arrowEndPos[6 * idx + 4] = endX;
        arrowEndPos[6 * idx + 5] = endY;

        arrowNormalDir[3 * idx + 0] = 0; // Tip vertex
        arrowNormalDir[3 * idx + 1] = 1; // Left vertex
        arrowNormalDir[3 * idx + 2] = -1; // Right vertex

        var pointSize = pointSizes[logicalEdges[2 * val + 1]];
        arrowPointSizes[3 * idx + 0] = pointSize;
        arrowPointSizes[3 * idx + 1] = pointSize;
        arrowPointSizes[3 * idx + 2] = pointSize;

        arrowColors[3 * idx + 0] = edgeColors32[2 * val + 1];
        arrowColors[3 * idx + 1] = edgeColors32[2 * val + 1];
        arrowColors[3 * idx + 2] = edgeColors32[2 * val + 1];
    }
};

function colorRGBInterpolator(color1, color2, lambda) {
    var r, g, b;
    r = color1.r * (1 - lambda) + color2.r * lambda;
    g = color1.g * (1 - lambda) + color2.g * lambda;
    b = color1.b * (1 - lambda) + color2.b * lambda;
    return {
        r: r,
        g: g,
        b: b
    };
}

// Convert from HSV to RGB Int
function convertColor2RGBInt(color) {
    return (color.r << 0) + (color.g << 8) + (color.b << 16);
}

// Convert from RGB Int to HSV
function convertRGBInt2Color(rgbInt) {
    return {
        r: rgbInt & 0xff,
        g: (rgbInt >> 8) & 0xff,
        b: (rgbInt >> 16) & 0xff
    };
}

RenderingScheduler.prototype.getMidEdgeColors = function(
    bufferSnapshot,
    numEdges,
    numRenderedSplits
) {
    var midEdgeColors,
        edges,
        edgeColors,
        srcColorInt,
        srcColor,
        dstColorInt,
        dstColor,
        edgeIndex,
        midEdgeIndex,
        numSegments,
        lambda,
        interpolatedColorInt;

    var numMidEdgeColors = numEdges * (numRenderedSplits + 1);

    srcColor = {};
    dstColor = {};

    midEdgeColors = this.getTypedArray('midEdgesColors', Uint32Array, numMidEdgeColors);

    numSegments = numRenderedSplits + 1;
    edges = new Uint32Array(bufferSnapshot.logicalEdges.buffer);
    edgeColors = new Uint32Array(bufferSnapshot.edgeColors.buffer);

    var cache = [];
    var putInCache = function(src, dst, val) {
        cache[src] = cache[src] || [];
        cache[src][dst] = val;
    };
    var getFromCache = function(src, dst) {
        if (!cache[src]) {
            return undefined;
        }
        return cache[src][dst];
    };

    for (edgeIndex = 0; edgeIndex < numEdges / 2; edgeIndex++) {
        srcColorInt = edgeColors[edgeIndex * 2];
        dstColorInt = edgeColors[edgeIndex * 2 + 1];

        var midEdgeColorIndex = 2 * edgeIndex * numSegments;
        var colorArray = getFromCache(srcColorInt, dstColorInt);
        if (!colorArray) {
            colorArray = new Uint32Array(numSegments * 2);
            srcColor = convertRGBInt2Color(srcColorInt);
            dstColor = convertRGBInt2Color(dstColorInt);

            interpolatedColorInt = convertColor2RGBInt(srcColor);
            colorArray[0] = interpolatedColorInt;

            for (midEdgeIndex = 0; midEdgeIndex < numSegments; midEdgeIndex++) {
                colorArray[midEdgeIndex * 2] = interpolatedColorInt;
                lambda = (midEdgeIndex + 1) / numSegments;
                interpolatedColorInt = convertColor2RGBInt(
                    colorRGBInterpolator(srcColor, dstColor, lambda)
                );

                colorArray[midEdgeIndex * 2 + 1] = interpolatedColorInt;
            }
            putInCache(srcColorInt, dstColorInt, colorArray);
        }

        midEdgeColors.set(colorArray, midEdgeColorIndex);
    }

    return midEdgeColors;
};

RenderingScheduler.prototype.makeArrows = function(bufferSnapshots, edgeMode, numRenderedSplits) {
    var logicalEdges = new Uint32Array(bufferSnapshots.logicalEdges.buffer);
    var pointSizes = new Uint8Array(bufferSnapshots.pointSizes.buffer);
    var edgeColors = new Uint32Array(bufferSnapshots.edgeColors.buffer);
    var numEdges = logicalEdges.length / 2;

    if (!bufferSnapshots.arrowStartPos) {
        bufferSnapshots.arrowStartPos = this.getTypedArray(
            'arrowStartPos',
            Float32Array,
            numEdges * 2 * 3
        );
    }
    var arrowStartPos = bufferSnapshots.arrowStartPos;

    if (!bufferSnapshots.arrowEndPos) {
        bufferSnapshots.arrowEndPos = this.getTypedArray(
            'arrowEndPos',
            Float32Array,
            numEdges * 2 * 3
        );
    }
    var arrowEndPos = bufferSnapshots.arrowEndPos;

    if (!bufferSnapshots.arrowNormalDir) {
        bufferSnapshots.arrowNormalDir = this.getTypedArray(
            'arrowNormalDir',
            Float32Array,
            numEdges * 3
        );
    }
    var arrowNormalDir = bufferSnapshots.arrowNormalDir;

    if (!bufferSnapshots.arrowColors) {
        bufferSnapshots.arrowColors = this.getTypedArray('arrowColors', Uint32Array, numEdges * 3);
    }
    var arrowColors = bufferSnapshots.arrowColors;

    if (!bufferSnapshots.arrowPointSizes) {
        bufferSnapshots.arrowPointSizes = this.getTypedArray(
            'arrowPointSizes',
            Uint8Array,
            numEdges * 3
        );
    }
    var arrowPointSizes = bufferSnapshots.arrowPointSizes;

    this.populateArrowBuffers(
        numEdges,
        bufferSnapshots.midSpringsPos,
        arrowStartPos,
        arrowEndPos,
        arrowNormalDir,
        pointSizes,
        logicalEdges,
        arrowPointSizes,
        arrowColors,
        edgeColors,
        numRenderedSplits
    );
};

/*
 * Render expensive items (eg, edges) when a quiet state is detected. This function is called
 * from within an animation frame and must execute all its work inside it. Callbacks(rx, etc)
 * are not allowed as they would schedule work outside the animation frame.
 */
RenderingScheduler.prototype.renderSlowEffects = function() {
    var appSnapshot = this.appSnapshot;
    var renderState = this.renderState;
    var edgeMode = renderState.config.edgeMode;
    var edgeHeight = renderState.config.arcHeight;
    var clientMidEdgeInterpolation = renderState.config.clientMidEdgeInterpolation;
    var numRenderedSplits = renderState.config.numRenderedSplits;
    var midSpringsPos;
    var midEdgesColors;
    var start;
    var end1, end2, end3, end4;

    var expanded,
        renderer = this.renderer;

    if (clientMidEdgeInterpolation && appSnapshot.vboUpdated) {
        //ARCS
        start = Date.now();
        expanded = this.expandLogicalEdges(
            renderState,
            appSnapshot.buffers,
            numRenderedSplits,
            edgeHeight
        );
        midSpringsPos = expanded.midSpringsPos;
        appSnapshot.buffers.midSpringsPos = midSpringsPos;
        appSnapshot.buffers.midSpringsStarts = expanded.midSpringsStarts;
        appSnapshot.buffers.midSpringsEnds = expanded.midSpringsEnds;

        // Only setup midEdge colors once, or when filtered.
        // Approximates filtering when number of logicalEdges changes.
        var numEdges = midSpringsPos.length / 2 / (numRenderedSplits + 1);
        var expectedNumMidEdgeColors = numEdges * (numRenderedSplits + 1);

        var shouldRecomputeEdgeColors =
            !appSnapshot.buffers.midEdgesColors ||
            appSnapshot.buffers.midEdgesColors.length !== expectedNumMidEdgeColors ||
            appSnapshot.bufferReceivedVersions.edgeColors !==
                appSnapshot.bufferComputedVersions.edgeColors;

        if (shouldRecomputeEdgeColors) {
            midEdgesColors = this.getMidEdgeColors(
                appSnapshot.buffers,
                numEdges,
                numRenderedSplits
            );
        }
        end1 = Date.now();
        if (shouldRecomputeEdgeColors) {
            appSnapshot.buffers.midEdgesColors = midEdgesColors;
            renderer.loadBuffers(renderState, { midEdgesColors: midEdgesColors });
            appSnapshot.bufferComputedVersions.edgeColors =
                appSnapshot.bufferReceivedVersions.edgeColors;
        }

        renderer.loadBuffers(renderState, { midSpringsPos: midSpringsPos });
        renderer.loadBuffers(renderState, { midSpringsStarts: expanded.midSpringsStarts });
        renderer.loadBuffers(renderState, { midSpringsEnds: expanded.midSpringsEnds });
        renderer.setNumElements(renderState, 'edgepicking', midSpringsPos.length / 2);
        renderer.setNumElements(renderState, 'midedgeculled', midSpringsPos.length / 2);
        end2 = Date.now();
        debug('Edges expanded in', end1 - start, '[ms], and loaded in', end2 - end1, '[ms]');
        this.makeArrows(appSnapshot.buffers, edgeMode, numRenderedSplits);
        end3 = Date.now();
        renderer.loadBuffers(renderState, { arrowStartPos: appSnapshot.buffers.arrowStartPos });
        renderer.loadBuffers(renderState, { arrowEndPos: appSnapshot.buffers.arrowEndPos });
        renderer.loadBuffers(renderState, { arrowNormalDir: appSnapshot.buffers.arrowNormalDir });
        renderer.loadBuffers(renderState, { arrowColors: appSnapshot.buffers.arrowColors });
        renderer.loadBuffers(renderState, { arrowPointSizes: appSnapshot.buffers.arrowPointSizes });

        // numEdges = length / 4 (stored as UInt8) * 0.5 (biDirectional)
        // numArrowElements = 3 * numEdges.
        var numArrowCulled = appSnapshot.buffers.logicalEdges.length / 2 / 4 * 3;

        renderer.setNumElements(renderState, 'arrowculled', numArrowCulled);
        end4 = Date.now();

        debug('Arrows generated in ', end3 - end2, '[ms], and loaded in', end4 - end3, '[ms]');
    } else if (false && appSnapshot.vboUpdated) {
        //EDGE BUNDLING
        //TODO deprecate/integrate?
        start = Date.now();

        expanded = this.expandLogicalMidEdges(appSnapshot.buffers);
        midSpringsPos = expanded.midSpringsPos;

        renderer.loadBuffers(renderState, { midSpringsPos: midSpringsPos });
        renderer.loadBuffers(renderState, { midSpringsStarts: expanded.midSpringsStarts });
        renderer.loadBuffers(renderState, { midSpringsEnds: expanded.midSpringsEnds });
        end1 = Date.now();
        renderer.setNumElements(renderState, 'edgepicking', midSpringsPos.length / 2);
        end2 = Date.now();
        console.debug(
            'Edges expanded in',
            end1 - start,
            '[ms], and loaded in',
            end2 - end1,
            '[ms]'
        );
    }

    renderer.render(renderState, 'fullscene', 'renderSceneFull');
    renderer.render(renderState, 'picking', 'picking', undefined, undefined, () => {
        this.appSnapshot.hitmapUpdates.onNext();
    });

    // TODO: Make steadyStateTextureDark instead of just doing it in the shader.
    renderer.copyCanvasToTexture(renderState, 'steadyStateTexture');
    renderer.setupFullscreenBuffer(renderState);
    this.renderMouseoverEffects();

    this.appSnapshot.fullScreenBufferDirty = false;
};

function getSortedConnectedEdges(nodeId, forwardsEdgeStartEndIdxs) {
    var resultSet = [];

    var stride = 2 * nodeId;
    var start = forwardsEdgeStartEndIdxs[stride];
    var end = forwardsEdgeStartEndIdxs[stride + 1];
    while (start < end) {
        var edgeIdx = start;
        resultSet.push(edgeIdx);
        start++;
    }

    return resultSet;
}

RenderingScheduler.prototype.renderMovePointsOverlay = function(task) {
    var { appSnapshot, renderState, renderer } = this;
    var { buffers } = appSnapshot;
    var { diff, sel } = task.data;
    var hostBuffers = renderState.hostBuffersCache;

    var hostNodePositions = new Float32Array(hostBuffers.curPoints.buffer);
    var hostNodeSizes = hostBuffers.pointSizes;
    var hostNodeColors = new Uint32Array(hostBuffers.pointColors.buffer);

    var movingNodeIndices = sel.getPointIndexValues();
    var numMovingNodes = movingNodeIndices.length;

    renderer.setNumElements(renderState, 'edgeselected', 0);
    renderer.setNumElements(renderState, 'pointselected', numMovingNodes);
    renderer.setNumElements(renderState, 'arrowselected', 0);

    // Create empty arrays for edges and arrows
    buffers.selectedEdges = new Float32Array(0);
    buffers.selectedEdgeStarts = new Float32Array(0);
    buffers.selectedEdgeEnds = new Float32Array(0);
    buffers.selectedEdgeColors = new Uint32Array(0);
    buffers.selectedArrowStartPos = new Float32Array(0);
    buffers.selectedArrowEndPos = new Float32Array(0);
    buffers.selectedArrowNormalDir = new Float32Array(0);
    buffers.selectedArrowPointColors = new Uint32Array(0);
    buffers.selectedArrowPointSizes = new Uint8Array(0);

    // Create arrays for nodes
    buffers.selectedNodePositions = new Float32Array(movingNodeIndices.length * 2);
    buffers.selectedNodeSizes = new Uint8Array(movingNodeIndices.length);
    buffers.selectedNodeColors = new Uint32Array(movingNodeIndices.length);

    let { selectedNodePositions, selectedNodeSizes, selectedNodeColors } = buffers;

    // Copy in node information
    _.each(movingNodeIndices, function(val, idx) {
        selectedNodePositions[idx * 2] = hostNodePositions[val * 2];
        selectedNodePositions[idx * 2 + 1] = hostNodePositions[val * 2 + 1];
        selectedNodeSizes[idx] = hostNodeSizes[val];
        selectedNodeColors[idx] = hostNodeColors[val];
    });

    // Updating positions given delta
    for (var i = 0, n = selectedNodePositions.length / 2; i < n; i++) {
        selectedNodePositions[i * 2] += diff.x;
        selectedNodePositions[i * 2 + 1] += diff.y;
    }

    renderer.loadBuffers(renderState, {
        selectedMidSpringsPos: buffers.selectedEdges,
        selectedMidEdgesColors: buffers.selectedEdgeColors,
        selectedMidSpringsStarts: buffers.selectedEdgeStarts,
        selectedMidSpringsEnds: buffers.selectedEdgeEnds,
        selectedCurPoints: buffers.selectedNodePositions,
        selectedPointSizes: buffers.selectedNodeSizes,
        selectedPointColors: buffers.selectedNodeColors,
        selectedArrowStartPos: buffers.selectedArrowStartPos,
        selectedArrowEndPos: buffers.selectedArrowEndPos,
        selectedArrowNormalDir: buffers.selectedArrowNormalDir,
        selectedArrowColors: buffers.selectedArrowPointColors,
        selectedArrowPointSizes: buffers.selectedArrowPointSizes
    });

    renderer.render(renderState, 'highlightDark', 'highlightDark');
};

/*
 * Render mouseover effects. These should only occur during a quiet state.
 *
 */

RenderingScheduler.prototype.renderMouseoverEffects = function(task) {
    var renderer = this.renderer;
    var appSnapshot = this.appSnapshot;
    var renderState = this.renderState;
    var buffers = appSnapshot.buffers;
    var numRenderedSplits = renderState.config.numRenderedSplits;
    var numMidEdges = numRenderedSplits + 1;

    // We haven't received any VBOs yet, so we shouldn't attempt to render.
    if (!buffers.logicalEdges || !buffers.midSpringsPos) {
        return;
    }

    if (task) {
        // Cache a copy of the task in case we need to execute again with our last task.
        // TODO: Consider restructuring it so that this isn't a stateful function.
        //
        // We need to be careful not to accidentally modify the internals of this cached task.
        // To be safe, we always cache it as a separate copy. Sucks because we need to know its full structure
        // here too, but whatever.
        this.lastMouseoverTask = {
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
    } else if (!(task = this.lastMouseoverTask)) {
        return;
    }

    var logicalEdges = new Uint32Array(buffers.logicalEdges.buffer);
    var hostBuffers = renderState.hostBuffersCache;
    var forwardsEdgeStartEndIdxs = new Uint32Array(hostBuffers.forwardsEdgeStartEndIdxs.buffer);

    var forwardsEdgeToUnsortedEdge = new Uint32Array(hostBuffers.forwardsEdgeToUnsortedEdge.buffer);

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

    // TODO: Decide whether we need to de-duplicate these arrays.
    // TODO: Decide a threshold or such to show neighborhoods for large selections.
    if (initialHighlightLengths <= 1) {
        // Extend edges with neighbors of nodes
        // BAD because uses pushes.

        _.each(highlightedNodeIndices, function(val) {
            var sortedConnectedEdges = getSortedConnectedEdges(val, forwardsEdgeStartEndIdxs);
            _.each(sortedConnectedEdges, sortedEdge => {
                var unsortedEdge = forwardsEdgeToUnsortedEdge[sortedEdge];
                highlightedEdgeIndices.push(unsortedEdge);
            });
        });

        // Extend node indices with edge endpoints
        _.each(highlightedEdgeIndices, function(val) {
            var stride = 2 * val;
            highlightedNodeIndices.push(logicalEdges[stride]);
            highlightedNodeIndices.push(logicalEdges[stride + 1]);
        });
    }

    //////////////////////////////////////////////////////////////////////////
    // Setup highlight buffers
    //////////////////////////////////////////////////////////////////////////

    renderer.setNumElements(
        renderState,
        'edgehighlight',
        highlightedEdgeIndices.length * 2 * numMidEdges
    );
    renderer.setNumElements(renderState, 'pointhighlight', highlightedNodeIndices.length);
    renderer.setNumElements(renderState, 'pointhighlightoutline', highlightedNodeIndices.length);
    renderer.setNumElements(renderState, 'arrowhighlight', highlightedEdgeIndices.length * 3);

    if (initialHighlightLengths > 0) {
        // TODO: Start with a small buffer and increase if necessary, masking underlying
        // data so we don't have to clear out later values. This way we won't have to constantly allocate
        buffers.highlightedEdges = new Float32Array(
            highlightedEdgeIndices.length * 4 * numMidEdges
        );
        buffers.highlightedNodePositions = new Float32Array(highlightedNodeIndices.length * 2);
        buffers.highlightedNodeSizes = new Uint8Array(highlightedNodeIndices.length);
        buffers.highlightedNodeColors = new Uint32Array(highlightedNodeIndices.length);
        buffers.highlightedArrowStartPos = new Float32Array(highlightedEdgeIndices.length * 2 * 3);
        buffers.highlightedArrowEndPos = new Float32Array(highlightedEdgeIndices.length * 2 * 3);
        buffers.highlightedArrowNormalDir = new Float32Array(highlightedEdgeIndices.length * 3);
        buffers.highlightedArrowPointColors = new Uint32Array(highlightedEdgeIndices.length * 3);
        buffers.highlightedArrowPointSizes = new Uint8Array(highlightedEdgeIndices.length * 3);

        let {
            highlightedEdges,
            midSpringsPos,
            highlightedNodePositions,
            highlightedNodeSizes,
            highlightedNodeColors
        } = buffers;

        // Copy in data
        _.each(highlightedEdgeIndices, function(val, idx) {
            // The start at the first midedge corresponding to hovered edge
            var edgeStartIdx = val * 4 * numMidEdges;
            var highlightStartIdx = idx * 4 * numMidEdges;
            for (var midEdgeIdx = 0; midEdgeIdx < numMidEdges; midEdgeIdx = midEdgeIdx + 1) {
                var midEdgeStride = midEdgeIdx * 4;
                highlightedEdges[highlightStartIdx + midEdgeStride] =
                    midSpringsPos[edgeStartIdx + midEdgeStride];
                highlightedEdges[highlightStartIdx + midEdgeStride + 1] =
                    midSpringsPos[edgeStartIdx + midEdgeStride + 1];
                highlightedEdges[highlightStartIdx + midEdgeStride + 2] =
                    midSpringsPos[edgeStartIdx + midEdgeStride + 2];
                highlightedEdges[highlightStartIdx + midEdgeStride + 3] =
                    midSpringsPos[edgeStartIdx + midEdgeStride + 3];
            }
        });

        _.each(highlightedNodeIndices, function(val, idx) {
            highlightedNodePositions[idx * 2] = hostNodePositions[val * 2];
            highlightedNodePositions[idx * 2 + 1] = hostNodePositions[val * 2 + 1];
            highlightedNodeSizes[idx] = hostNodeSizes[val];
            highlightedNodeColors[idx] = hostNodeColors[val];
        });

        this.populateArrowBuffers(
            highlightedEdgeIndices,
            buffers.midSpringsPos,
            buffers.highlightedArrowStartPos,
            buffers.highlightedArrowEndPos,
            buffers.highlightedArrowNormalDir,
            hostNodeSizes,
            logicalEdges,
            buffers.highlightedArrowPointSizes,
            buffers.highlightedArrowPointColors,
            buffers.edgeColors,
            numRenderedSplits
        );

        renderer.loadBuffers(renderState, {
            highlightedEdgesPos: buffers.highlightedEdges,
            highlightedPointsPos: buffers.highlightedNodePositions,
            highlightedPointsSizes: buffers.highlightedNodeSizes,
            highlightedPointsColors: buffers.highlightedNodeColors,
            highlightedArrowStartPos: buffers.highlightedArrowStartPos,
            highlightedArrowEndPos: buffers.highlightedArrowEndPos,
            highlightedArrowNormalDir: buffers.highlightedArrowNormalDir,
            highlightedArrowPointColors: buffers.highlightedArrowPointColors,
            highlightedArrowPointSizes: buffers.highlightedArrowPointSizes
        });
    }

    //////////////////////////////////////////////////////////////////////////
    // Setup selected buffers
    //////////////////////////////////////////////////////////////////////////

    // TODO: Start with a small buffer and increase if necessary, masking underlying
    // data so we don't have to clear out later values. This way we won't have to constantly allocate

    renderer.setNumElements(
        renderState,
        'edgeselected',
        selectedEdgeIndices.length * 2 * numMidEdges
    );
    renderer.setNumElements(renderState, 'pointselected', selectedNodeIndices.length);
    renderer.setNumElements(renderState, 'pointselectedoutline', selectedNodeIndices.length);
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

        let {
            selectedEdges,
            selectedEdgeStarts,
            selectedEdgeEnds,
            selectedEdgeColors,
            midEdgesColors,
            midSpringsPos,
            midSpringsStarts,
            midSpringsEnds,
            selectedNodePositions,
            selectedNodeSizes,
            selectedNodeColors
        } = buffers;

        // Copy in data
        _.each(selectedEdgeIndices, function(val, idx) {
            // The start at the first midedge corresponding to hovered edge
            var edgeStartIdx = val * 4 * numMidEdges;
            var highlightStartIdx = idx * 4 * numMidEdges;
            var edgeColorStartIdx = val * 2 * numMidEdges;
            var highlightColorStartIdx = idx * 2 * numMidEdges;
            for (var midEdgeIdx = 0; midEdgeIdx < numMidEdges; midEdgeIdx++) {
                var midEdgeStride = midEdgeIdx * 4;
                selectedEdges[highlightStartIdx + midEdgeStride] =
                    midSpringsPos[edgeStartIdx + midEdgeStride];
                selectedEdges[highlightStartIdx + midEdgeStride + 1] =
                    midSpringsPos[edgeStartIdx + midEdgeStride + 1];
                selectedEdges[highlightStartIdx + midEdgeStride + 2] =
                    midSpringsPos[edgeStartIdx + midEdgeStride + 2];
                selectedEdges[highlightStartIdx + midEdgeStride + 3] =
                    midSpringsPos[edgeStartIdx + midEdgeStride + 3];

                selectedEdgeStarts[highlightStartIdx + midEdgeStride] =
                    midSpringsStarts[edgeStartIdx + midEdgeStride];
                selectedEdgeStarts[highlightStartIdx + midEdgeStride + 1] =
                    midSpringsStarts[edgeStartIdx + midEdgeStride + 1];
                selectedEdgeStarts[highlightStartIdx + midEdgeStride + 2] =
                    midSpringsStarts[edgeStartIdx + midEdgeStride + 2];
                selectedEdgeStarts[highlightStartIdx + midEdgeStride + 3] =
                    midSpringsStarts[edgeStartIdx + midEdgeStride + 3];

                selectedEdgeEnds[highlightStartIdx + midEdgeStride] =
                    midSpringsEnds[edgeStartIdx + midEdgeStride];
                selectedEdgeEnds[highlightStartIdx + midEdgeStride + 1] =
                    midSpringsEnds[edgeStartIdx + midEdgeStride + 1];
                selectedEdgeEnds[highlightStartIdx + midEdgeStride + 2] =
                    midSpringsEnds[edgeStartIdx + midEdgeStride + 2];
                selectedEdgeEnds[highlightStartIdx + midEdgeStride + 3] =
                    midSpringsEnds[edgeStartIdx + midEdgeStride + 3];

                var midEdgeColorStride = midEdgeIdx * 2;
                selectedEdgeColors[highlightColorStartIdx + midEdgeColorStride] =
                    midEdgesColors[edgeColorStartIdx + midEdgeColorStride];
                selectedEdgeColors[highlightColorStartIdx + midEdgeColorStride + 1] =
                    midEdgesColors[edgeColorStartIdx + midEdgeColorStride + 1];
            }
        });

        _.each(selectedNodeIndices, function(val, idx) {
            selectedNodePositions[idx * 2] = hostNodePositions[val * 2];
            selectedNodePositions[idx * 2 + 1] = hostNodePositions[val * 2 + 1];
            selectedNodeSizes[idx] = hostNodeSizes[val];
            selectedNodeColors[idx] = hostNodeColors[val];
        });

        this.populateArrowBuffers(
            selectedEdgeIndices,
            buffers.midSpringsPos,
            buffers.selectedArrowStartPos,
            buffers.selectedArrowEndPos,
            buffers.selectedArrowNormalDir,
            hostNodeSizes,
            logicalEdges,
            buffers.selectedArrowPointSizes,
            buffers.selectedArrowPointColors,
            buffers.edgeColors,
            numRenderedSplits
        );

        renderer.loadBuffers(renderState, {
            selectedMidSpringsPos: buffers.selectedEdges,
            selectedMidEdgesColors: buffers.selectedEdgeColors,
            selectedMidSpringsStarts: buffers.selectedEdgeStarts,
            selectedMidSpringsEnds: buffers.selectedEdgeEnds,
            selectedCurPoints: buffers.selectedNodePositions,
            selectedPointSizes: buffers.selectedNodeSizes,
            selectedPointColors: buffers.selectedNodeColors,
            selectedArrowStartPos: buffers.selectedArrowStartPos,
            selectedArrowEndPos: buffers.selectedArrowEndPos,
            selectedArrowNormalDir: buffers.selectedArrowNormalDir,
            selectedArrowColors: buffers.selectedArrowPointColors,
            selectedArrowPointSizes: buffers.selectedArrowPointSizes
        });
    }

    //////////////////////////////////////////////////////////////////////////
    // Handle Rendering + Texture backdrop.
    //////////////////////////////////////////////////////////////////////////

    var shouldDarken = selectedEdgeIndices.length > 0 || selectedNodeIndices.length > 0;
    var renderTrigger = shouldDarken ? 'highlightDark' : 'highlight';

    renderer.render(renderState, renderTrigger, renderTrigger);
};

RenderingScheduler.prototype.loadRadialAxes = function loadRadialAxes(axes, background) {
    const subradialColor = isDark(Color(background.color).rgb())
        ? { r: 255 / 256, g: 255 / 256, b: 255 / 256, a: 0.3 }
        : { r: 0, g: 0, b: 0, a: 0.1 };

    let { renderer, renderState } = this,
        { camera } = renderState;
    let radialAxes = (axes || []).filter(({ r }) => typeof r === 'number');
    const axisStyles = {
        internal: { r: 89 / 256, g: 162 / 256, b: 255 / 256, a: 0.999 },
        external: { r: 255 / 256, g: 128 / 256, b: 64 / 256, a: 0.999 },
        minor: subradialColor,
        space: subradialColor
    };
    let x = 0,
        y = 0,
        maxStrokeWidth = 10,
        numRadialAxes = radialAxes.length;
    let radialAxesBuffer = this.getTypedArray('radialAxes', Float32Array, numRadialAxes * 3 * 6);
    for (let j = -1, i = -1; ++i < numRadialAxes; ) {
        let axis = radialAxes[i];
        let r = axis.r;
        let isThin = axis.space;
        let color =
            axisStyles[
                axis.internal
                    ? 'internal'
                    : axis.external ? 'external' : axis.space ? 'space' : 'minor'
            ];
        let flags =
            ((isThin ? 1 : 0) << 16) +
            (Math.floor(color.r * 16) << 12) +
            (Math.floor(color.g * 16) << 8) +
            (Math.floor(color.b * 16) << 4) +
            Math.floor(color.a * 16);

        radialAxesBuffer[++j] = x - r - maxStrokeWidth;
        radialAxesBuffer[++j] = y - r - maxStrokeWidth;
        radialAxesBuffer[++j] = x;
        radialAxesBuffer[++j] = y;
        radialAxesBuffer[++j] = r;
        radialAxesBuffer[++j] = flags;

        radialAxesBuffer[++j] = x + (1 + Math.sqrt(2)) * (r + maxStrokeWidth);
        radialAxesBuffer[++j] = y - r - maxStrokeWidth;
        radialAxesBuffer[++j] = x;
        radialAxesBuffer[++j] = y;
        radialAxesBuffer[++j] = r;
        radialAxesBuffer[++j] = flags;

        radialAxesBuffer[++j] = x - r - maxStrokeWidth;
        radialAxesBuffer[++j] = y + (1 + Math.sqrt(2)) * (r + maxStrokeWidth);
        radialAxesBuffer[++j] = x;
        radialAxesBuffer[++j] = y;
        radialAxesBuffer[++j] = r;
        radialAxesBuffer[++j] = flags;
    }
    renderer.loadBuffers(renderState, { radialAxes: radialAxesBuffer });
    renderer.setNumElements(renderState, 'radialaxes', numRadialAxes * 3);
};

RenderingScheduler.prototype.renderMovePointsTemporaryPositions = function(diff, sel) {
    this.renderScene('movePointsOverlay', { data: { diff, sel } });
};

// Given a render config and info about number of nodes/edges,
// generate an array of functions that will allocate memory for them
RenderingScheduler.prototype.allocateAllArrayBuffersFactory = function(
    config,
    numElements,
    renderState
) {
    var functions = [],
        renderer = this.renderer;
    debug('Allocating all arraybuffers on hint for numElements: ', numElements);
    _.each(config.models, (model, modelName) => {
        _.each(model, desc => {
            if (typeof desc.sizeHint === 'function') {
                // Default to 4;
                // TODO: Have a proper lookup for bytelengths
                var bytesPerElement = 4;
                if (desc.type === 'FLOAT') {
                    bytesPerElement = 4;
                } else if (desc.type === 'UNSIGNED_INT') {
                    bytesPerElement = 4;
                } else if (desc.type === 'UNSIGNED_BYTE') {
                    bytesPerElement = 1;
                }

                // It compute a size hint from the render config.
                var sizeInBytes = desc.sizeHint(numElements) * desc.count * bytesPerElement;

                if (!isNaN(sizeInBytes)) {
                    // Allocate arraybuffers for RenderingScheduler
                    functions.push(() => {
                        this.allocateArrayBufferOnHint(modelName, sizeInBytes);
                    });
                    // Allocate GPU buffer in renderer
                    functions.push(() => {
                        renderer.allocateBufferSize(renderState, modelName, sizeInBytes);
                    });
                }
            }
        });
    });
    return functions;
};

// Explicitly allocate an array buffer for a given name based on a size hint
RenderingScheduler.prototype.allocateArrayBufferOnHint = function(name, bytes) {
    debug('Hinted allocation of', bytes, 'bytes for', name);
    if (!this.arrayBuffers[name] || this.arrayBuffers[name].byteLength < bytes) {
        debug('Allocating', bytes, 'bytes for', name, 'on hint.');
        this.arrayBuffers[name] = new ArrayBuffer(bytes);
    }
};

// Get a typed array by name, of a certain type and length.
// We go through this function to allow arraybuffer reuse,
// and to make preallocation easier. Because we reuse data buffers,
// older typed arrays of the same name are invalidated.
RenderingScheduler.prototype.getTypedArray = function(name, Constructor, length) {
    var bytesPerElement = Constructor.BYTES_PER_ELEMENT;
    var lengthInBytes = length * bytesPerElement;
    debug('getting typed array for ' + name + ':', Constructor, length, lengthInBytes);
    // TODO: Check to make sure that we don't leak references to old
    // array buffers when we replace with a bigger one.
    if (!this.arrayBuffers[name] || this.arrayBuffers[name].byteLength < lengthInBytes) {
        debug('Reallocating for ' + name + ' to: ', lengthInBytes, 'bytes');
        debug('Old byteLength: ', this.arrayBuffers[name] ? this.arrayBuffers[name].byteLength : 0);
        this.arrayBuffers[name] = new ArrayBuffer(lengthInBytes);
    } else {
        debug('Was in cache of proper size -- fast path');
    }

    var array = new Constructor(this.arrayBuffers[name], 0, length);
    return array;
};

// Given a render config and info about number of nodes/edges,
// figure out the size of our largest model for letting the
// renderer create index buffers.
RenderingScheduler.prototype.getLargestModelSize = function(config, numElements) {
    debug('Getting largest model size for: ', numElements);
    var sizes = _.map(config.models, function(model) {
        return _.map(model, function(desc) {
            if (typeof desc.sizeHint === 'function') {
                // Compute a size hint from the render config.
                return desc.sizeHint(numElements);
            } else {
                return 0;
            }
        });
    });
    var maxNum = _.max(_.flatten(sizes));
    return maxNum;
};

RenderingScheduler.prototype.dispose = RenderingScheduler.prototype._unsubscribe = function() {
    const { hintsAllocationCycle } = this;

    if (hintsAllocationCycle) {
        hintsAllocationCycle.unsubscribe();
    }
    this.hintsAllocationCycle = null;
};

export { RenderingScheduler };
export default RenderingScheduler;

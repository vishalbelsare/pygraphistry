import Color from 'color';
import classNames from 'classnames';
import React, { PropTypes } from 'react';

import { Observable } from 'rxjs/Observable';
import { Subscription } from 'rxjs/Subscription';
import * as Scheduler from 'rxjs/scheduler/animationFrame';

import {
    pointSizes,
    toggleZoomIn,
    toggleCenter,
    toggleZoomOut,
    brushOn, marqueeOn,
    simulateOn, isAnimating,
    latestHighlightedObject,
    anyMarqueeOn, cameraChanges,
    hitmapUpdates, activeSelection,
    curPoints, vboUpdates, vboVersions,
    selectedEdgeIndexes, selectedPointIndexes
} from 'viz-client/legacy';

import {
    compose,
    getContext,
    shallowEqual
} from 'recompose';

function checkEqualityIfFalcorVersionAvailable (a, b, defaultValue = false) {
    if (a.$__version !== undefined && b.$__version !== undefined) {
        return a.$__version === b.$__version;
    }
    return defaultValue;
}

function shallowEqualOrFalcorEqual (a, b) {
    // Default to shallow equal, if not true, check falcor version number
    return shallowEqual(a, b) || checkEqualityIfFalcorVersionAvailable(a, b);
}

class Renderer extends React.Component {
    constructor(props, context) {
        super(props, context);
        this.arrowItems = {};
        this.renderFast = undefined;
        this.renderPanZoom = undefined;
        this.renderBGColor = undefined;
        this.renderMouseOver = undefined;
        this.hasRenderedSelectionOnce = false;
        this.cameraChangesSubscription = new Subscription();
        this.assignContainerRef = (x) => this.container = x;
    }
    shouldComponentUpdate(nextProps) {

        const currProps = this.props;

        const {
            background: currBackground,
            edges: currEdges, points: currPoints,
            highlight: currHighlight, selection: currSelection,
            ...restCurrProps
        } = currProps;

        const {
            background: nextBackground,
            edges: nextEdges, points: nextPoints,
            highlight: nextHighlight, selection: nextSelection,
            ...restNextProps
        } = nextProps;

        return (
            !shallowEqual(currEdges, nextEdges) ||
            !shallowEqual(currPoints, nextPoints) ||
            !shallowEqualOrFalcorEqual(currHighlight, nextHighlight) ||
            !shallowEqualOrFalcorEqual(currSelection, nextSelection) ||
            !shallowEqualOrFalcorEqual(currBackground, nextBackground) ||
            !shallowEqual(restCurrProps, restNextProps)
        );
    }
    componentWillMount() {
        this.updateRendererStateAndScheduler({}, this.props, this.state);
    }
    componentWillUpdate(nextProps, nextState) {
        this.updateRendererStateAndScheduler(this.props, nextProps, nextState);
    }
    componentDidMount() {
        this.container.appendChild(this.props.simulation);
        this.cameraChangesSubscription = cameraChanges
            .distinctUntilChanged(
                shallowEqual,
                ({ width, height, center = {} } = {}) => ({
                    width, height, ...center
                })
            )
            .auditTime(0, Scheduler.animationFrame)
            .subscribe((camera) => {
                this.renderPanZoom = true;
                this.forceUpdate();
            });
    }
    componentWillUnmount() {
        const { cameraChangesSubscription } = this;
        cameraChangesSubscription.unsubscribe();
        this.container = undefined;
        this.arrowItems = undefined;
        this.renderFast = undefined;
        this.renderPanZoom = undefined;
        this.renderBGColor = undefined;
        this.renderMouseOver = undefined;
        this.assignContainerRef = undefined;
        this.cameraChangesSubscription = undefined;
    }
    render() {

        const { props, container } = this;
        const { renderState, renderingScheduler,
                simulation, highlight, selection,
                simBackgroundImage: backgroundImage = 'none' } = props;

        if (renderState && renderingScheduler && container && simulation) {

            let { renderFast, renderPanZoom, renderMouseOver, renderBGColor } = this;

            if (renderBGColor) {
                renderBGColor = false;
                renderingScheduler.renderScene('bgcolor', {
                    trigger: 'renderSceneFast'
                });
            }

            if (renderPanZoom) {
                renderPanZoom = false;
                // console.log('renderPanZoom with trigger', renderFast ? 'renderSceneFast' : 'renderSceneFull');
                renderingScheduler.renderScene('panzoom', {
                    trigger: renderFast ?
                        'renderSceneFast' : 'renderSceneFull'
                });
                if (typeof renderFast !== 'number') {
                    renderFast = undefined;
                }
            }

            if (renderMouseOver) {
                renderMouseOver = false;
                let { edge: selectionEdges, point: selectionPoints } = selection;
                const { edge: highlightEdges, point: highlightPoints, darken = false } = highlight;
                if (darken && !(
                    selectionEdges && selectionEdges.length) && !(
                    selectionPoints && selectionPoints.length)) {
                    selectionEdges = highlightEdges;
                    selectionPoints = highlightPoints;
                }
                const mouseoverTask = {
                    trigger: 'mouseOverEdgeHighlight',
                    data: {
                        highlight: {
                            edgeIndices: highlightEdges || [],
                            nodeIndices: highlightPoints || [],
                        },
                        selected: {
                            edgeIndices: selectionEdges || [],
                            nodeIndices: selectionPoints || [],
                        }
                    }
                };
                if (!this.hasRenderedSelectionOnce) {
                    this.hasRenderedSelectionOnce = true;
                    // trick the rendering scheduler into believing
                    // it _really_ wants to render the first mouseover task
                    renderingScheduler.lastMouseoverTask = mouseoverTask;
                }
                renderingScheduler.renderScene('mouseOver', mouseoverTask);
            }

            this.renderFast = renderFast;
            this.renderPanZoom = renderPanZoom;
            this.renderBGColor = renderBGColor;
            this.renderMouseOver = renderMouseOver;
        }

        return (
            <div ref={this.assignContainerRef}
                 style={{
                    width: `100%`,
                    height:`100%`,
                    top: 0, left: 0,
                    right: 0, bottom: 0,
                    position:`absolute`,
                    backgroundImage
                }}/>
        );
    }
    updateRendererStateAndScheduler(currProps = {}, nextProps = {}, nextState = {}) {

        const { renderState, renderingScheduler } = nextProps;

        if (!renderState || !renderingScheduler) {
            return;
        }

        const {
            edges: currEdges = {},
            camera: currCamera = {},
            points: currPoints = {},
            highlight: currHighlight = {},
            selection: currSelection = {},
            background: currBackground = {},
            simulating: currSimulating = true,
            showArrows: currShowArrows = true,
        } = currProps;

        const {
            edges: nextEdges = currEdges,
            camera: nextCamera = currCamera,
            points: nextPoints = currPoints,
            highlight: nextHighlight = currHighlight,
            selection: nextSelection = currSelection,
            background: nextBackground = currBackground,
            simulating: nextSimulating = currSimulating,
            showArrows: nextShowArrows = currShowArrows,
        } = nextProps;

        let { renderFast,
              renderBGColor,
              renderPanZoom,
              renderMouseOver,
              hasRenderedSelectionOnce } = this;

        const updateArg = {
            currEdges, currPoints,
            nextEdges, nextPoints,
            currCamera, nextCamera,
            currHighlight, nextHighlight,
            currSelection, nextSelection,
            currBackground, nextBackground,
            currShowArrows, nextShowArrows,
            currSimulating, nextSimulating,
            renderState, renderingScheduler
        };

        renderBGColor = this.updateBackground(updateArg) || renderBGColor;
        renderPanZoom = this.updateNumElements(updateArg) || renderPanZoom;
        renderPanZoom = this.updateShowArrows(updateArg) || renderPanZoom;
        renderPanZoom = this.updateEdgeScaling(updateArg) || renderPanZoom;
        renderPanZoom = this.updatePointScaling(updateArg) || renderPanZoom;
        renderPanZoom = this.updateEdgeOpacity(updateArg) || renderPanZoom;
        renderPanZoom = this.updatePointOpacity(updateArg) || renderPanZoom;
        renderPanZoom = this.updateCameraCenterAndZoom(updateArg) || renderPanZoom;
        renderPanZoom = this.updateSimulating(updateArg) || renderPanZoom && !nextSimulating;
        renderMouseOver = this.updateSceneHighlight(updateArg) || renderMouseOver && !nextSimulating;

        if (hasRenderedSelectionOnce === true) {
            renderMouseOver = this.updateSceneSelection(updateArg) || renderMouseOver && !nextSimulating;
        } else {
            const { edge: nextEdge, point: nextPoint } = nextSelection;
            renderMouseOver = (nextEdge && nextEdge.length) ||
                              (nextPoint && nextPoint.length) ||
                              (renderMouseOver);
        }

        if (renderPanZoom || renderBGColor) {
            if (typeof renderFast === 'number') {
                clearTimeout(renderFast);
                renderFast = undefined;
                // console.log('clearing renderFast');
            }
            // console.log('requesting renderPanZoom', renderFast);
            if (typeof renderFast === 'undefined') {
                // console.log('enqueueing renderFast');
                renderFast = setTimeout(() => {
                    // console.log('executing renderFast');
                    this.renderFast = false;
                    this.renderPanZoom = true;
                    this.forceUpdate();
                }, 200);
            }
        }

        this.renderFast = renderFast;
        this.renderPanZoom = renderPanZoom;
        this.renderBGColor = renderBGColor;
        this.renderMouseOver = renderMouseOver;
    }
    updateNumElements({
        currEdges, currPoints,
        nextEdges, nextPoints,
        renderState, renderingScheduler
    }) {
        if (currEdges.elements !== nextEdges.elements ||
            currPoints.elements !== nextPoints.elements) {
            renderingScheduler.attemptToAllocateBuffersOnHints(
                renderState.config, renderState, {
                    edges: nextEdges.elements,
                    points: nextPoints.elements,
                }
            );
            return true;
        }
        return false;
    }
    updateSimulating({
        currSimulating, nextSimulating,
        renderState, renderingScheduler
    }) {
        if (currSimulating !== nextSimulating) {
            simulateOn.next(nextSimulating);
            return true;
        }
        return false;
    }
    updateEdgeScaling({
        currEdges, nextEdges,
        renderState, renderingScheduler
    }) {
        if (currEdges.scaling !== nextEdges.scaling) {
            renderState.camera.setEdgeScaling(nextEdges.scaling);
            return true;
        }
        return false;
    }
    updatePointScaling({
        currPoints, nextPoints,
        renderState, renderingScheduler
    }) {
        if (currPoints.scaling !== nextPoints.scaling) {
            renderState.camera.setPointScaling(nextPoints.scaling);
            return true;
        }
        return false;
    }
    updateEdgeOpacity({
        currEdges, nextEdges,
        renderState, renderingScheduler
    }) {
        if (currEdges.opacity !== nextEdges.opacity) {
            const { uniforms } = renderState;
            const opacity = [nextEdges.opacity];
            for (const uniformName in uniforms) {
                const uniform = uniforms[uniformName];
                if ('edgeOpacity' in uniform) {
                    uniform['edgeOpacity'] = opacity;
                }
            }
            return true;
        }
        return false;
    }
    updatePointOpacity({
        currPoints, nextPoints,
        renderState, renderingScheduler
    }) {
        if (currPoints.opacity !== nextPoints.opacity) {
            const { uniforms } = renderState;
            const opacity = [nextPoints.opacity];
            for (const uniformName in uniforms) {
                const uniform = uniforms[uniformName];
                if ('pointOpacity' in uniform) {
                    uniform['pointOpacity'] = opacity;
                }
            }
            return true;
        }
        return false;
    }
    updateShowArrows({
        currShowArrows, nextShowArrows,
        renderState, renderingScheduler
    }) {
        if (currShowArrows !== nextShowArrows) {
            const { arrowItems } = this;
            const { items: rendererItems } = renderState;
            const addToMap = nextShowArrows ? rendererItems : arrowItems;
            const deleteFromMap = nextShowArrows ? arrowItems : rendererItems;
            ['arrowculled', 'arrowhighlight', 'arrowselected'].forEach((itemName) => {
                if (deleteFromMap[itemName]) {
                    addToMap[itemName] = deleteFromMap[itemName];
                    delete deleteFromMap[itemName];
                }
            });
            return true;
        }
        return false;
    }
    updateBackground({
        currBackground, nextBackground,
        renderState, renderingScheduler
    }) {
        if (!shallowEqualOrFalcorEqual(currBackground, nextBackground)) {
            renderState.options.clearColor = [
                new Color(nextBackground.color).rgbaArray().map((x, i) =>
                    i === 3 ? x : x / 255
                )
            ];
            return true;
        }
        return false;
    }
    updateCameraCenterAndZoom({
        currCamera, nextCamera,
        renderState, renderingScheduler
    }) {
        if (currCamera.$__version === nextCamera.$__version) {
            return false;
        }
        const { center: currCenter = {} } = currCamera;
        const { center: nextCenter = currCenter } = nextCamera;
        if (currCenter.$__version !== nextCenter.$__version) {
            if (nextCenter.x === 0 &&
                nextCenter.y === 0 &&
                nextCenter.z === 0) {
                toggleCenter.next();
                return true;
            }
            return !shallowEqual(currCenter, nextCenter);
        } else if (nextCamera.zoom < currCamera.zoom) {
            toggleZoomIn.next();
            return true;
        } else if (nextCamera.zoom > currCamera.zoom) {
            toggleZoomOut.next();
            return true;
        }
        return false;
    }
    updateSceneHighlight({
        currHighlight, nextHighlight,
        renderState, renderingScheduler
    }) {
        const { edge: currEdge, point: currPoint } = currHighlight;
        const { edge: nextEdge, point: nextPoint } = nextHighlight;
        if (!currEdge || !currPoint) {
            return !!(nextEdge || nextPoint);
        }
        return !shallowEqualOrFalcorEqual(currHighlight, nextHighlight);
    }
    updateSceneSelection({
        currSelection, nextSelection,
        renderState, renderingScheduler
    }) {
        const { edge: currEdge, point: currPoint } = currSelection;
        const { edge: nextEdge, point: nextPoint } = nextSelection;
        if (!currEdge || !currPoint) {
            return !!(nextEdge || nextPoint);
        }
        return !shallowEqualOrFalcorEqual(currSelection, nextSelection);
    }
}

Renderer = getContext({
    simulation: PropTypes.object,
    renderState: PropTypes.object,
    renderingScheduler: PropTypes.object,
    simBackgroundImage: PropTypes.string
})(Renderer);

export { Renderer };

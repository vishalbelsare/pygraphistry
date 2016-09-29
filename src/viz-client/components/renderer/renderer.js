import $ from 'jquery';
import Color from 'color';
import { Gestures } from 'rxjs-gestures';
import React, { PropTypes } from 'react';
import {
    Subject, Observable,
    Subscription, ReplaySubject
} from 'rxjs';

import {
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

import { scenes } from 'viz-shared/models/scene';
import {
    resizeCanvas,
    init as initRenderer
} from 'viz-client/streamGL/renderer';
import {
    RenderingScheduler,
    setupCameraInteractions
} from 'viz-client/streamGL/graphVizApp/canvas';

import {
    setupRotate,
    setupCenter,
    setupZoomButton
} from 'viz-client/streamGL/graphVizApp/interaction';

class Renderer extends React.Component {
    constructor(props, context) {
        super(props, context);
        this.assignContainerRef = (x) => this.container = x;
        this.arrowItems = {};
        this.renderFast = undefined;
        this.renderPanZoom = null;
        this.renderBGColor = null;
        this.state = {
            hasVBOListeners: false,
            hasDOMListeners: false,
            renderSubscription: new Subscription()
        };
    }
    shouldComponentUpdate(nextProps) {

        const currProps = this.props;

        const {
            edges: currEdges, points: currPoints,
            background: currBackground, ...restCurrProps
        } = currProps;

        const {
            edges: nextEdges, points: nextPoints,
            background: nextBackground, ...restNextProps
        } = nextProps;

        return (
            !shallowEqual(currEdges, nextEdges) ||
            !shallowEqual(currPoints, nextPoints) ||
            !shallowEqual(currBackground, nextBackground) ||
            !shallowEqual(restCurrProps, restNextProps)
        );
    }
    componentWillMount() {
        const { props, state } = this;
        const { sceneID } = props;
        if (sceneID && (sceneID in scenes)) {
            this.setupRenderStateAndScheduler(props, state);
        }
        this.updateRendererStateAndScheduler({}, props, state);
    }
    componentWillReceiveProps(nextProps) {
        const currProps = this.props;
        const { sceneID: currSceneID } = currProps;
        const { sceneID: nextSceneID } = nextProps;
        if (nextSceneID && currSceneID !== nextSceneID && (nextSceneID in scenes)) {
            this.setupRenderStateAndScheduler(nextProps, this.state);
        }
    }
    componentWillUpdate(nextProps, nextState) {
        this.updateRendererStateAndScheduler(this.props, nextProps, nextState);
    }
    componentDidUpdate() {
        this.setupDOMAndSourceListeners(this.props, this.state);
    }
    componentDidMount() {
        const { props, state, container } = this;
        const { simulation } = props;
        const { renderState, hasDOMListeners } = state;
        simulation.style.top = 0;
        simulation.style.left = 0;
        simulation.style.right = 0;
        simulation.style.bottom = 0;
        simulation.style.width = `100%`;
        simulation.style.height =`100%`;
        simulation.style.position =`absolute`;
        container.appendChild(simulation);
        renderState && resizeCanvas(renderState);
        this.setupDOMAndSourceListeners(props, state);
    }
    componentWillUnmount() {
        const {
            renderSubscription,
            renderingScheduler
        } = this.state;
        renderSubscription.unsubscribe();
        renderingScheduler.unsubscribe();
        this.container = null;
        this.arrowItems = null;
        this.renderFast = undefined;
        this.renderPanZoom = null;
        this.renderBGColor = null;
        this.assignContainerRef = null;
    }
    render() {

        let { renderFast, renderPanZoom, renderBGColor } = this;

        const { renderingScheduler } = this.state;
        const { simBackgroundImage: backgroundImage = 'none' } = this.props;

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

        this.renderFast = renderFast;
        this.renderPanZoom = renderPanZoom;
        this.renderBGColor = renderBGColor;

        return (
            <div id='simulation-container'
                 ref={this.assignContainerRef}
                 style={{
                    width: `100%`,
                    height:`100%`,
                    top: 0, left: 0,
                    right: 0, bottom: 0,
                    position:`absolute`,
                    backgroundImage
                }}
            />
        );
    }
    setupRenderStateAndScheduler(props, state) {

        let {
            hasDOMListeners,
            hasVBOListeners,
            vboUpdatesSource,
            vboVersionsSource,
            hasSourceListeners,
            renderingScheduler,
        } = state;

        hasSourceListeners = false;

        const {
            socket, simulation, simCameraBounds,
            handleVboUpdates, sceneID, pixelRatio,
        } = props;

        const scene = scenes[sceneID]();
        const uri = { href: '/graph/', pathname: '' };
        const rendererOptions = { pixelRatio, ...simCameraBounds };
        const renderState = initRenderer(scene, simulation, rendererOptions);
        const { hostBuffers: {
            'curPoints': curPointsSource,
            'selectedEdgeIndexes': selectedEdgeIndexesSource,
            'selectedPointIndexes': selectedPointIndexesSource
        }} = renderState;

        if (hasVBOListeners === false) {

            hasVBOListeners = true;

            const vboSubjects = handleVboUpdates(socket, uri, renderState);
            vboUpdatesSource = vboSubjects.vboUpdates;
            vboVersionsSource = vboSubjects.vboVersions;

            renderingScheduler = new RenderingScheduler(
                renderState,
                vboUpdates, vboVersions,
                hitmapUpdates, isAnimating,
                simulateOn, activeSelection,
                { edge: undefined, point: undefined }
            );
        } else {
            renderingScheduler.renderState = renderState;
        }

        this.setState({
            renderState,
            curPointsSource,
            hasVBOListeners,
            vboUpdatesSource,
            vboVersionsSource,
            hasSourceListeners,
            renderingScheduler,
            selectedEdgeIndexesSource,
            selectedPointIndexesSource
        });
    }
    setupDOMAndSourceListeners(props, state) {

        const { container } = this;

        if (!container || (
            state.hasDOMListeners &&
            state.hasSourceListeners)) {
            return;
        }

        const { play, socket } = props;

        let {
            renderState,
            curPointsSource,
            hasDOMListeners,
            vboUpdatesSource,
            vboVersionsSource,
            hasSourceListeners,
            renderSubscription,
            renderingScheduler,
            cameraChangesSource,
            selectedEdgeIndexesSource,
            selectedPointIndexesSource,
        } = state;

        hasSourceListeners = true;

        renderSubscription.unsubscribe();

        if (hasDOMListeners === false) {

            hasDOMListeners = true;

            const { camera } = renderState;
            const rotateSource = setupRotate($(container), camera);
            const centerSource = setupCenter(toggleCenter, curPoints, camera);
            const zoomInSource = setupZoomButton(toggleZoomIn, camera, 1 / 1.25);
            const zoomOutSource = setupZoomButton(toggleZoomOut, camera, 1.25);
            const panSource = Gestures
                .pan(container)
                .mergeMap((pan) => Observable.defer(() => {
                    const { offsetWidth, offsetHeight } = container;
                    const forceRatio = 0.5 * (
                        (camera.width / offsetWidth) +
                        (camera.height / offsetHeight));
                    const { x: originX, y: originY } = camera.center;
                    return pan.decelerate(0.25, 9.8 / forceRatio).do({
                        next: ({ movementXTotal, movementYTotal }) => {
                            camera.center.x = originX - (movementXTotal * camera.width / offsetWidth);
                            camera.center.y = originY - (movementYTotal * camera.height / offsetHeight);
                            this.renderFast = true;
                            this.renderPanZoom = true;
                            this.forceUpdate();
                        },
                        complete: () => {
                            this.renderFast = false;
                            this.renderPanZoom = true;
                            this.forceUpdate();
                        }
                    })
                }).repeat())
                .mapTo(camera);

            cameraChangesSource = Observable.merge(
                rotateSource, centerSource, zoomInSource, zoomOutSource, panSource
            );
            // cameraChangesSource = setupCameraInteractions({
            //     toggleZoomIn, toggleZoomOut,
            //     brushOn, curPoints, marqueeOn,
            //     renderState, toggleCenter, anyMarqueeOn,
            //     activeSelection, latestHighlightedObject,
            // }, $(this.container));
        }

        renderSubscription = Observable.merge(
            // Subscribe the global Subjects to their legacy sources.
            // Eventually we need to refactor the render loop to work
            // within the React component lifecycle, then delete this code.
            curPointsSource.do(curPoints),
            vboUpdatesSource.do(vboUpdates),
            vboVersionsSource.do(vboVersions),
            cameraChangesSource.do(cameraChanges),
            selectedEdgeIndexesSource.do(selectedEdgeIndexes),
            selectedPointIndexesSource.do(selectedPointIndexes),

            vboUpdates
                .filter((update) => update === 'received')
                .take(1)
                .mergeMap(() => Observable
                    .interval(40)
                    .take(play || 50)
                    .do(() => {
                        socket.emit('interaction', { play: true, layout: true });
                    })
                    .takeWhile(() => this.props.simulating === true)
                    .concat(Observable.timer(100).do(() => {
                        this.renderFast = false;
                        this.renderPanZoom = true;
                        this.forceUpdate();
                    }))
                    .do(() => {
                        if (this.props.camera.center === true) {
                            toggleCenter.next();
                        }
                    })
                )
        )
        .ignoreElements()
        .subscribe();

        this.setState({
            hasDOMListeners,
            hasSourceListeners,
            renderSubscription,
        });
    }
    updateRendererStateAndScheduler(currProps = {}, nextProps = {}, nextState = {}) {

        const { renderState, renderingScheduler } = nextState;

        if (!renderState || !renderingScheduler) {
            return;
        }

        const {
            edges: currEdges = {},
            camera: currCamera = {},
            points: currPoints = {},
            simulating: currSimulating,
            background: currBackground = {},
            showArrows: currShowArrows = true,
        } = currProps;

        const {
            edges: nextEdges = currEdges,
            camera: nextCamera = currCamera,
            points: nextPoints = currPoints,
            simulating: nextSimulating = currSimulating,
            background: nextBackground = currBackground,
            showArrows: nextShowArrows = currShowArrows,
        } = nextProps;

        let renderFast = this.renderFast,
            renderBGColor = this.renderBGColor,
            renderPanZoom = this.renderPanZoom;

        renderBGColor = this.updateBackground({
            currBackground, nextBackground,
            renderState, renderingScheduler
        }) || renderBGColor;

        renderPanZoom = (this.updateNumElements({
            currEdges, currPoints,
            nextEdges, nextPoints,
            renderState, renderingScheduler
        }) && false) || renderPanZoom;

        renderPanZoom = this.updateSimulating({
            currSimulating, nextSimulating,
            renderState, renderingScheduler
        }) || renderPanZoom;

        renderPanZoom = this.updateEdgeScaling({
            currEdges, nextEdges,
            renderState, renderingScheduler
        }) || renderPanZoom;

        renderPanZoom = this.updatePointScaling({
            currPoints, nextPoints,
            renderState, renderingScheduler
        }) || renderPanZoom;

        renderPanZoom = this.updateEdgeOpacity({
            currEdges, nextEdges,
            renderState, renderingScheduler
        }) || renderPanZoom;

        renderPanZoom = this.updatePointOpacity({
            currPoints, nextPoints,
            renderState, renderingScheduler
        }) || renderPanZoom;

        renderPanZoom = this.updateShowArrows({
            currShowArrows, nextShowArrows,
            renderState, renderingScheduler
        }) || renderPanZoom;

        renderPanZoom = this.updateCameraCenterAndZoom({
            currCamera, nextCamera,
            renderState, renderingScheduler
        }) || renderPanZoom;

        if (renderPanZoom) {
            // console.log('requesting renderPanZoom', renderFast);
            if (typeof renderFast === 'number') {
                clearTimeout(renderFast);
                renderFast = undefined;
                // console.log('clearing renderFast');
            } else if (typeof renderFast === 'undefined') {
                // console.log('enqueueing renderFast');
                renderFast = setTimeout(() => {
                    // console.log('executing renderFast');
                    this.renderPanZoom = true;
                    this.forceUpdate();
                }, 200);
            }
        }

        this.renderFast = renderFast;
        this.renderPanZoom = renderPanZoom;
        this.renderBGColor = renderBGColor;
    }
    updateNumElements({
        currEdges, currPoints,
        nextEdges, nextPoints,
        renderState, renderingScheduler
    }) {
        if (currEdges.elements !== nextEdges.elements ||
            currPoints.elements !== nextPoints.elements) {
            renderingScheduler.attemptToAllocateBuffersOnHints(
                renderState.config,
                renderState, {
                    edges: nextEdges.elements,
                    points: nextPoints.elements
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
        if (!shallowEqual(currBackground, nextBackground)) {
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
        if (currCamera.center !== nextCamera.center &&
            typeof nextCamera.center === 'boolean') {
            toggleCenter.next();
            return true;
        } else if (nextCamera.zoom < currCamera.zoom) {
            toggleZoomIn.next();
            return true;
        } else if (nextCamera.zoom > currCamera.zoom) {
            toggleZoomOut.next();
            return true;
        }
        return false;
    }
}

Renderer = compose(
    getContext({
        play: PropTypes.number,
        socket: PropTypes.object,
        pixelRatio: PropTypes.number,
        simulation: PropTypes.object,
        handleVboUpdates: PropTypes.func,
        simBackgroundImage: PropTypes.string
    })
)(Renderer);

export { Renderer };

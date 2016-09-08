import Color from 'color';
import React, { PropTypes } from 'react';
import { Subject, Observable, ReplaySubject } from 'rxjs';
import {
    compose,
    getContext,
    shallowEqual
} from 'recompose';

import VizSlice from 'viz-client/streamGL/graphVizApp/VizSlice';
import { init as initRenderer } from 'viz-client/streamGL/renderer';
import { RenderingScheduler } from 'viz-client/streamGL/graphVizApp/canvas';

function assignCanvasRefToRenderer(renderer) {
    return function(canvas) {
        renderer.canvasElement = canvas;
    }
}

class Renderer extends React.Component {
    constructor(props, context) {
        super(props, context);
        this.autoCenter = false;
        this.autoSimulateCount = 0;
        this.autoSimulateTotal = 10;
        this.assignCanvasRef = assignCanvasRefToRenderer(this);
    }
    shouldComponentUpdate(nextProps) {

        const { scene: nextScene, scene: {
                hints: nextHints,
                camera: nextCamera,
                simulating: nextSimulating
        }} = nextProps;

        const { scene: currScene, scene: {
                hints: currHints,
                camera: currCamera,
                simulating: currSimulating
        }} = this.props;

        if (currSimulating !== nextSimulating) {
            return true;
        }

        if (!shallowEqual(currHints, nextHints)) {
            return true;
        }

        const { edges: nextEdges, points: nextPoints } = nextCamera;
        const { edges: currEdges, points: currPoints } = currCamera;

        if (!shallowEqual(currEdges, nextEdges)) {
            return true;
        }

        if (!shallowEqual(currPoints, nextPoints)) {
            return true;
        }

        if (!shallowEqual(currCamera, nextCamera)) {
            return true;
        }

        return !shallowEqual(currScene, nextScene);
    }
    componentWillUpdate(nextProps) {
        this.scheduleRenderTasks(this.props, nextProps);
    }
    componentDidUpdate(prevProps) {
    }
    componentDidMount() {

        const { props, canvasElement } = this;
        const { scene, socket, play = 10, handleVboUpdates, ...restProps } = props;

        const { hints, camera, simulating } = scene;
        const uri = { href: '/graph/', pathname: '' };

        const simulateOn = new ReplaySubject(1);
        const isAnimating = new ReplaySubject(1);
        const hitmapUpdates = new ReplaySubject(1);
        const activeSelection = new ReplaySubject(1);

        isAnimating.next(true);
        simulateOn.next(simulating);
        activeSelection.next(new VizSlice([]));

        const renderState = initRenderer(scene, canvasElement, restProps);
        const { vboUpdates, vboVersions } = handleVboUpdates(socket, uri, renderState);

        const renderingScheduler = new RenderingScheduler(renderState, vboUpdates,
                                                          vboVersions, hitmapUpdates,
                                                          isAnimating, simulateOn,
                                                          activeSelection, hints);

        this.autoSimulateTotal = play;
        this.renderState = renderState;
        this.renderingScheduler = renderingScheduler;

        this.vboUpdates = vboUpdates;
        this.vboVersions = vboVersions;
        this.simulateOn = simulateOn;
        this.isAnimating = isAnimating;
        this.hitmapUpdates = hitmapUpdates;
        this.activeSelection = activeSelection;
        this.curPoints = renderState.hostBuffers.curPoints;

        vboUpdates
            .filter((update) => update === 'received')
            .take(1).subscribe(() => {

                const { renderState } = this;
                const cameraInstance = renderState.camera;

                this.props.layoutScene({ simulating: false });
                this.props.layoutCamera({
                    cameraInstance,
                    points: this.curPoints,
                    center: true,
                    camera: {
                        ...camera,
                        width: cameraInstance.width,
                        height: cameraInstance.height
                    },
                });
            });
    }
    componentWillUnmount() {

        debugger

        const {
            curPoints,
            vboUpdates,
            vboVersions,
            simulateOn,
            isAnimating,
            hitmapUpdates,
            activeSelection,
        } = this;

        this.curPoints = null;
        this.vboUpdates = null;
        this.renderState = null;
        this.vboVersions = null;
        this.simulateOn = null;
        this.isAnimating = null;
        this.hitmapUpdates = null;
        this.activeSelection = null;
        this.renderingScheduler = null;

        curPoints && curPoints.unsubscribe();
        vboUpdates && vboUpdates.unsubscribe();
        vboVersions && vboVersions.unsubscribe();
        simulateOn && simulateOn.unsubscribe();
        isAnimating && isAnimating.unsubscribe();
        hitmapUpdates && hitmapUpdates.unsubscribe();
        activeSelection && activeSelection.unsubscribe();
    }
    scheduleRenderTasks(currProps, nextProps) {

        const { simulateOn } = this;
        const { renderState, renderingScheduler } = this;

        const { scene: {
                hints: currHints,
                simulating: currSimulating,
                background: { color: currBGColor },
        }} = currProps;

        const { scene: {
                hints: nextHints,
                simulating: nextSimulating,
                background: { color: nextBGColor },
        }} = nextProps;

        if (nextSimulating !== currSimulating) {
            simulateOn.next(nextSimulating);
        }

        if (!shallowEqual(currHints, nextHints)) {
            renderingScheduler.attemptToAllocateBuffersOnHints(
                nextProps.scene, renderState, nextHints
            );
        }

        if (nextBGColor !== currBGColor) {
            renderState.options.clearColor = [
                new Color(nextBGColor).rgbaArray().map((x, i) =>
                    i === 3 ? x : x / 255
                )
            ];
            renderingScheduler.renderScene('bgcolor', { trigger: 'renderSceneFast' });
        }
    }
    render() {
        return (
            <canvas ref={this.assignCanvasRef} id='simulation' style={{
                width: `100%`,
                height:`100%`,
                top: 0, left: 0,
                right: 0, bottom: 0,
                position:`absolute` }}>
                WebGL not supported
            </canvas>
        );
    }
}

Renderer = compose(
    getContext({
        play: PropTypes.number,
        socket: PropTypes.object,
        pixelRatio: PropTypes.number,
        handleVboUpdates: PropTypes.func
    })
)(Renderer);

export { Renderer };

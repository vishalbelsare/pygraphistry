import Color from 'color';
import styles from './styles.less';
import { Gestures } from 'rxjs-gestures';
import React from 'react';
import PropTypes from 'prop-types';
import { Subject } from 'rxjs/Subject';
import { Observable } from 'rxjs/Observable';
import { Subscription } from 'rxjs/Subscription';
import { ReplaySubject } from 'rxjs/ReplaySubject';
import { Control as SettingsControl } from 'viz-app/containers/settings';
import {
    pointSizes,
    pointColors,
    edgeColors,
    toggleZoomIn,
    toggleCenter,
    toggleZoomOut,
    simulateOn,
    isAnimating,
    cameraChanges,
    hitmapUpdates,
    curPoints, vboUpdates, vboVersions
} from 'viz-app/client/legacy';

import compose from 'recompose/compose';
import getContext from 'recompose/getContext';
import shallowEqual from 'recompose/shallowEqual';

import { scenes } from 'viz-app/models/scene';
import RenderingScheduler from './rendering-scheduler';
import { init as initRenderer } from './renderer';
import { setupRotate, setupCenter, setupScroll, setupZoomButton } from './interaction';

const events = ['onMouseMove', 'onTouchStart', 'onShiftDown'];
let globalVboUpdates, globalVboVersions, globalAutoPlayed;
let globalRenderer, globalRenderState, globalRenderingScheduler;

class Scene extends React.Component {
    static childContextTypes = {
        renderState: PropTypes.object,
        renderingScheduler: PropTypes.object,
    };
    constructor(props, context) {
        super(props, context);
        this.state = {
            renderer: undefined,
            renderState: undefined,
            renderingScheduler: undefined,
            hasDOMListeners: false,
            hasVBOListeners: false,
            renderSubscription: new Subscription(),
            bgDivStyle: { position: 'absolute', width: `100%`, height: `100%` }
        };
        this.simulationWidth = 0;
        this.simulationHeight = 0;
        this.container = undefined;
        this.assignRef = (container) => {
            (this.container = container) && this.onResize && this.onResize({
                simulationWidth: container.offsetWidth,
                simulationHeight: container.offsetHeight
            });
        };
        this.onResize = ({ simulationWidth, simulationHeight }) => {
            this.simulationWidth = simulationWidth;
            this.simulationHeight = simulationHeight;
            const { renderer, renderState = {} } = this.state;
            const { camera } = renderState;
            if (renderer && renderState && camera) {
                camera.simulationWidth = simulationWidth;
                camera.simulationHeight = simulationHeight;
                renderer.resizeCanvas(renderState);
            }
            return !!camera;
        };
        const makeEventHandler = (eventName) => this[eventName] = (event) => {
            const { props, state } = this;
            const dispatch = props[eventName];
            const { renderState, renderingScheduler } = state;
            if (!dispatch || !renderState || !renderingScheduler) { return; }
            const { camera } = renderState;
            const { simulationWidth, simulationHeight } = this;
            const { simulating, highlightEnabled, selection = {} } = props;
            dispatch({
                event,
                selectionMask: selection.mask,
                selectionType: selection.type,
                simulationWidth, simulationHeight,
                camera, simulating, renderState,
                renderingScheduler, highlightEnabled
            });
        };
        events.forEach((eventName) => {
            const handler = makeEventHandler(eventName);
            if (eventName === 'onShiftDown') {
                this[eventName] = (event) => {
                    if (!event.repeat && event.key === 'Shift') {
                        handler(event);
                    }
                }
            }
        });
    }
    getChildContext() {
        const { renderState, renderingScheduler } = this.state;
        return { renderState, renderingScheduler };
    }
    componentWillMount() {
        const { props, state } = this;
        const { sceneID } = props;
        if (sceneID && (sceneID in scenes)) {
            this.setupRenderStateAndScheduler(props, state);
        }
    }
    componentWillReceiveProps(nextProps) {
        const { props, state } = this;
        const { sceneID: currSceneID } = props;
        const { sceneID: nextSceneID } = nextProps;
        if (!state.renderState && nextSceneID && currSceneID !== nextSceneID && (nextSceneID in scenes)) {
            this.setupRenderStateAndScheduler(nextProps, this.state);
        }
        const { bgDivStyle } = state;
        const backgroundColor = new Color(nextProps.backgroundColor).rgbaString();
        if (bgDivStyle.backgroundColor !== backgroundColor) {
            this.setState({ bgDivStyle: {...bgDivStyle, backgroundColor } });
        }
    }
    componentDidMount() {
        // console.log('mounted scene');
        const { props, state } = this;
        const { renderer, renderState } = state;
        renderer && renderer.resizeCanvas(renderState);
        this.setupDOMAndSourceListeners(props, state);
    }
    componentDidUpdate(prevProps) {
        this.setupDOMAndSourceListeners(this.props, this.state);
        const { simulationWidth, simulationHeight } = this.props;
        if (this.simulationWidth !== simulationWidth || this.simulationHeight !== simulationHeight) {
            this.onResize({ simulationWidth, simulationHeight });
        }
    }
    componentWillUnmount() {
        // console.log('unmounting scene');
        this.onResize = undefined;
        this.assignRef = undefined;
        const { renderSubscription } = this.state;
        renderSubscription && renderSubscription.unsubscribe();
        events.forEach((eventName) => this[eventName] = undefined);
    }
    render() {
        const { bgDivStyle } = this.state;
        const { edges, points, release, children } = this.props;
        const { labelPOIOption, pruneIsolatedOption } = this.props;
        const { info = true, menu = true, showLogo = true } = this.props;
        const releaseString = release.buildNumber ? `v${release.buildNumber}` : '';

        return (
            <div id='simulation-container'
                 ref={this.assignRef}
                 style={this.props.style}
                 onKeyDown={this.onShiftDown}
                 onMouseMove={this.onMouseMove}
                 onMouseDown={this.onTouchStart}
                 onTouchStart={this.onTouchStart}>
                <div style={bgDivStyle}/>
                {children}
                {(info || menu) &&
                <div className={styles['top-level-scene-info']}>
                    {info &&
                    <table className={styles['meter']}>
                        <tbody>
                            <tr>
                                <td className={styles['meter-label']}>
                                    nodes
                                </td>
                                <td className={styles['meter-value']}>
                                    {points && points.elements || 0}
                                </td>
                            </tr>
                            <tr>
                                <td className={styles['meter-label']}>
                                    edges
                                </td>
                                <td className={styles['meter-value']}>
                                    {edges && edges.elements || 0}
                                </td>
                            </tr>
                        </tbody>
                    </table> || undefined }
                    { menu &&
                    <div className={styles['top-level-controls']}>
                        <div>{pruneIsolatedOption}</div>
                        <div>{labelPOIOption}</div>
                    </div> || undefined }
                </div> || undefined }
                <div className={styles['logo-container']}>
                    { showLogo &&
                        <img draggable='false' src='img/logo_white_horiz.png'/> || undefined }
                    <div className={styles['logo-version']}
                         onMouseDown={this.stopEventPropagation}
                         onMouseOver={this.stopEventPropagation}
                         onMouseOut={this.stopEventPropagation}>
                        { releaseString }
                    </div>
                </div>
            </div>
        );
    }
    stopEventPropagation(e) {
        e.stopPropagation();
    }
    setupRenderStateAndScheduler(props, state) {

        let {
            renderer,
            renderState,
            renderingScheduler,
            hasVBOListeners,
            vboUpdatesSource,
            vboVersionsSource,
            hasSourceListeners,
        } = state;

        hasSourceListeners = false;

        const {
            sceneID, handleVboUpdates, pixelRatio,
            falcor, socket, simulation, simCameraBounds,
        } = props;

        if (!handleVboUpdates) {
            return;
        }

        // console.log('initializing render state and scheduler');

        if (globalRenderer && globalRenderState && globalRenderingScheduler) {
            hasVBOListeners = true;
            renderer = globalRenderer;
            renderState = globalRenderState;
            renderingScheduler = globalRenderingScheduler;
            vboUpdatesSource = globalVboUpdates;
            vboVersionsSource = globalVboVersions;
        } else {
            const scene = scenes[sceneID]();
            const rendererOptions = { pixelRatio, ...simCameraBounds };
            const rendererInit = initRenderer(scene, simulation, rendererOptions);
            renderer = globalRenderer = rendererInit.renderer;
            renderState = globalRenderState = rendererInit.state;

            if (hasVBOListeners === false) {

                hasVBOListeners = true;

                const uri = {
                    pathname: `${window.graphistryPath || ''}`,
                    href: `${window.graphistryPath || ''}/graph/`
                };
                const vboSubjects = handleVboUpdates(socket, uri, renderState, falcor, renderer);
                vboUpdatesSource = globalVboUpdates = vboSubjects.vboUpdates;
                vboVersionsSource = globalVboVersions = vboSubjects.vboVersions;

                renderingScheduler = globalRenderingScheduler = new RenderingScheduler(
                    renderState, renderer,
                    vboUpdates, vboVersions,
                    hitmapUpdates, isAnimating,
                    simulateOn, { edge: undefined, point: undefined }
                );
            } else {
                renderingScheduler.renderState = renderState;
            }
        }

        const { hostBuffers: {
            'curPoints': curPointsSource,
            'pointSizes': pointSizesSource,
            'pointColors': pointColorsSource,
            'edgeColors': edgeColorsSource
        }} = renderState;

        this.setState({
            renderer,
            renderState,
            curPointsSource,
            hasVBOListeners,
            pointSizesSource,
            pointColorsSource,
            edgeColorsSource,
            vboUpdatesSource,
            vboVersionsSource,
            hasSourceListeners,
            renderingScheduler,
        });
    }
    setupDOMAndSourceListeners(props = {}, state = {}) {

        const { container } = this;
        let   { play = 5000 } = props;
        const { socket, simulation,
                selectToolbarItem } = props;
        let {
            renderer,
            renderState,
            scrollSource,
            curPointsSource,
            hasDOMListeners,
            pointSizesSource,
            pointColorsSource,
            edgeColorsSource,
            vboUpdatesSource,
            vboVersionsSource,
            hasSourceListeners,
            renderSubscription,
            renderingScheduler,
            cameraChangesSource,
        } = state;

        if (!container || !simulation || !renderState || (
            hasDOMListeners && hasSourceListeners)) {
            return;
        }

        hasSourceListeners = true;

        renderSubscription.unsubscribe();

        if (hasDOMListeners === false) {

            hasDOMListeners = true;

            const { camera } = renderState;
            const centerSource = setupCenter(toggleCenter, curPoints, camera);
            const zoomInSource = setupZoomButton(toggleZoomIn, camera, 1/1.25);
            const zoomOutSource = setupZoomButton(toggleZoomOut, camera, 1.25);
            const rotateSource = setupRotate(container, camera);

            scrollSource = setupScroll(container, simulation, camera);

            cameraChangesSource = Observable.merge(
                rotateSource, scrollSource,// panSource,
                centerSource, zoomInSource, zoomOutSource
            );
        }

        let stopAutoPlay = Observable.never();
        let stopAutoCenter = Observable.never();

        if (play === true) {
            stopAutoPlay = Observable.never();
            stopAutoCenter = scrollSource.take(1);
        } else if (typeof play !== 'number' || !(play = +play)) {
            stopAutoPlay = Observable.of(true);
            stopAutoCenter = Observable.never();
        } else {
            stopAutoCenter = scrollSource.take(1);
            stopAutoPlay = Observable.race(
                Observable.timer(play),
                Observable.defer(() => Gestures.start(container))
                          .catch(() => Observable.empty())
            ).take(1);
        }

        renderSubscription = Observable.merge(
            // Subscribe the global Subjects to their legacy sources.
            // Eventually we need to refactor the render loop to work
            // within the React component lifecycle, then delete this code.
            curPointsSource.do(curPoints),
            pointSizesSource.do(pointSizes),
            pointColorsSource.do(pointColors),
            edgeColorsSource.do(edgeColors),
            vboUpdatesSource.do(vboUpdates),
            vboVersionsSource.do(vboVersions),
            cameraChangesSource.do(cameraChanges),

            vboUpdates
                .filter((update) => update === 'received')
                .take(1)
                .filter(() => !!selectToolbarItem)
                .takeWhile(() => !globalAutoPlayed && (globalAutoPlayed = true))
                .do(() => selectToolbarItem({
                    socket,
                    selected: !play,
                    stop: stopAutoPlay,
                    center: stopAutoCenter,
                    id: 'toggle-simulating'
                }))
        )
        .ignoreElements()
        .subscribe({});

        this.setState({
            scrollSource,
            hasDOMListeners,
            hasSourceListeners,
            renderSubscription,
            cameraChangesSource
        });
    }
}

Scene = compose(
    getContext({
        info: PropTypes.bool,
        menu: PropTypes.bool,
        play: PropTypes.number,
        socket: PropTypes.object,
        showLogo: PropTypes.bool,
        falcor: PropTypes.object,
        pixelRatio: PropTypes.number,
        simulation: PropTypes.object,
        handleVboUpdates: PropTypes.func,
    })
)(Scene);

export { Scene };

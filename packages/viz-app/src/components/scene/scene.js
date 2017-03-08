import styles from './styles.less';
import { Gestures } from 'rxjs-gestures';
import React, { PropTypes } from 'react';
import { Subject } from 'rxjs/Subject';
import { Observable } from 'rxjs/Observable';
import { Subscription } from 'rxjs/Subscription';
import { ReplaySubject } from 'rxjs/ReplaySubject';
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

const events = ['mouseMove', 'touchStart'];

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
            hasDOMListeners: false,
            hasVBOListeners: false,
            renderingScheduler: undefined,
            renderSubscription: new Subscription(),
            resizeSubscription: new Subscription(),
        };
        this.simulationWidth = 0;
        this.simulationHeight = 0;
        this.container = undefined;
        this.assignRef = (container) => {
            this.onResize && this.onResize(this.container = container);
        };
        this.onResize = () => {
            const { container } = this;
            if (container) {
                this.simulationWidth = container.offsetWidth;
                this.simulationHeight = container.offsetHeight;
            }
            const { renderState: { camera } = {} } = this.state;
            if (camera) {
                camera.simulationWidth = this.simulationWidth;
                camera.simulationHeight = this.simulationHeight;
            }
        };
        events.forEach((eventName) => {
            this[eventName] = (event) => {
                const { props, state } = this;
                const dispatch = props[eventName];
                const { renderState, renderingScheduler } = state;
                if (!dispatch || !renderState || !renderingScheduler) { return; }
                const { camera } = renderState;
                const { simulating, selection = {} } = props;
                const { simulationWidth, simulationHeight } = this;
                dispatch({
                    event,
                    selectionMask: selection.mask,
                    selectionType: selection.type,
                    simulationWidth, simulationHeight,
                    camera, simulating, renderState,
                    renderingScheduler
                });
            };
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
    }
    componentDidMount() {
        const { props, state } = this;
        const { renderer, renderState } = state;
        renderer && renderer.resizeCanvas(renderState);
        this.setupDOMAndSourceListeners(props, state);
    }
    componentDidUpdate() {
        this.setupDOMAndSourceListeners(this.props, this.state);
    }
    componentWillUnmount() {
        this.onResize = undefined;
        this.container = undefined;
        this.assignRef = undefined;
        const { renderer, renderingScheduler } = this.state;
        const { resizeSubscription, renderSubscription } = this.state;
        renderer && renderer.unsubscribe();
        resizeSubscription && resizeSubscription.unsubscribe();
        renderSubscription && renderSubscription.unsubscribe();
        renderingScheduler && renderingScheduler.unsubscribe();
        events.forEach((eventName) => this[eventName] = undefined);
    }
    render() {
        const { edges, points, release, children } = this.props;
        const releaseString = release.buildNumber ? `${release.tag}, build #${release.buildNumber}`
                                                  : `${release.tag}`;

        return (
            <div id='simulation-container'
                 ref={this.assignRef}
                 onMouseMove={this.mouseMove}
                 onMouseDown={this.touchStart}
                 onTouchStart={this.touchStart}
                 style={{
                     width: `100%`,
                     height: `100%`,
                     position: `absolute`
                 }}>
                {children}
                {(  (edges && edges.elements !== undefined) ||
                    (points && points.elements !== undefined)) &&
                    <table className={styles['meter']}
                           onMouseOver={this.hideOnMouseOver}
                           onMouseOut={this.showOnMouseOut}>
                        <tbody>
                            <tr>
                                <td className={styles['meter-label']}>
                                    nodes
                                </td>
                                <td className={styles['meter-value']}>{
                                    points && points.elements || 0
                                }</td>
                            </tr>
                            <tr>
                                <td className={styles['meter-label']}>
                                    edges
                                </td>
                                <td className={styles['meter-value']}>{
                                    edges && edges.elements || 0
                                }</td>
                            </tr>
                        </tbody>
                    </table>
                }
                <div className={styles['logo-container']}
                     onMouseOver={this.hideOnMouseOver}
                     onMouseOut={this.showOnMouseOut}>
                    <img draggable='false' src='img/logo_white_horiz.png'/>
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
    hideOnMouseOver({ currentTarget }) {
        // currentTarget.style.opacity = 0;
    }
    showOnMouseOut({ currentTarget }) {
        // currentTarget.style.opacity = 1;
    }
    stopEventPropagation(e) {
        e.stopPropagation();
    }
    setupRenderStateAndScheduler(props, state) {

        let {
            hasVBOListeners,
            vboUpdatesSource,
            vboVersionsSource,
            hasSourceListeners,
            renderingScheduler,
        } = state;

        hasSourceListeners = false;

        const {
            sceneID, handleVboUpdates, pixelRatio,
            falcor, socket, simulation, simCameraBounds,
        } = props;

        if (!handleVboUpdates) {
            return;
        }

        const scene = scenes[sceneID]();
        const uri = {
            pathname: `${window.graphistryPath || ''}`,
            href: `${window.graphistryPath || ''}/graph/`,
        };
        const rendererOptions = { pixelRatio, ...simCameraBounds };
        const { state: renderState, renderer } = initRenderer(scene, simulation, rendererOptions);
        const { hostBuffers: {
            'curPoints': curPointsSource,
            'pointSizes': pointSizesSource,
            'pointColors': pointColorsSource,
            'edgeColors': edgeColorsSource
        }} = renderState;

        if (hasVBOListeners === false) {

            hasVBOListeners = true;

            const vboSubjects = handleVboUpdates(socket, uri, renderState, falcor, renderer);
            vboUpdatesSource = vboSubjects.vboUpdates;
            vboVersionsSource = vboSubjects.vboVersions;

            renderingScheduler = new RenderingScheduler(
                renderState, renderer,
                vboUpdates, vboVersions,
                hitmapUpdates, isAnimating,
                simulateOn, { edge: undefined, point: undefined }
            );
        } else {
            renderingScheduler.renderState = renderState;
        }

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
            resizeSubscription,
            renderingScheduler,
            cameraChangesSource,
        } = state;

        if (!container || !simulation || !renderState || (
            hasDOMListeners && hasSourceListeners)) {
            return;
        }

        hasSourceListeners = true;

        renderSubscription.unsubscribe();
        resizeSubscription.unsubscribe();

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
                .take(1).filter(() => !!selectToolbarItem)
                .do(() => selectToolbarItem({
                    socket,
                    selected: false,
                    stop: stopAutoPlay,
                    center: stopAutoCenter,
                    id: 'toggle-simulating'
                }))
        )
        .ignoreElements()
        .subscribe({});

        resizeSubscription = Observable.defer(() => typeof document === 'undefined' ? Observable
            .empty() : Observable
            .fromEvent(document, 'resize'))
            .debounceTime(200)
            .catch(() => Observable.empty())
            .subscribe(this.onResize);

        this.setState({
            scrollSource,
            hasDOMListeners,
            hasSourceListeners,
            renderSubscription,
            resizeSubscription,
            cameraChangesSource
        });
    }
}

Scene = compose(
    getContext({
        play: PropTypes.number,
        socket: PropTypes.object,
        falcor: PropTypes.object,
        pixelRatio: PropTypes.number,
        simulation: PropTypes.object,
        handleVboUpdates: PropTypes.func,
    })
)(Scene);

export { Scene };

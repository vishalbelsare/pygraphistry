import $ from 'jquery';
import { Gestures } from 'rxjs-gestures';
import React, { PropTypes } from 'react';
import {
    Subject, Observable,
    Subscription, ReplaySubject
} from 'rxjs';
import styles from 'viz-shared/components/scene/styles.less';

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
    curPoints, vboUpdates, vboVersions
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
    RenderingScheduler
} from 'viz-client/streamGL/graphVizApp/canvas';

import {
    setupRotate,
    setupCenter,
    setupScroll,
    setupZoomButton
} from 'viz-client/streamGL/graphVizApp/interaction';

const events = [
    'mouseMove',
    'touchStart',
];

class Scene extends React.Component {
    static childContextTypes = {
        renderState: PropTypes.object,
        renderingScheduler: PropTypes.object,
    };
    constructor(props, context) {
        super(props, context);
        this.state = {
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
            this.onResize(this.container = container);
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
        const currProps = this.props;
        const { sceneID: currSceneID } = currProps;
        const { sceneID: nextSceneID } = nextProps;
        if (nextSceneID && currSceneID !== nextSceneID && (nextSceneID in scenes)) {
            this.setupRenderStateAndScheduler(nextProps, this.state);
        }
    }
    componentDidMount() {
        const { props, state } = this;
        const { renderState } = state;
        renderState && resizeCanvas(renderState);
        this.setupDOMAndSourceListeners(props, state);
    }
    componentDidUpdate() {
        this.setupDOMAndSourceListeners(this.props, this.state);
    }
    componentWillUnmount() {
        this.onResize = undefined;
        this.container = undefined;
        this.assignRef = undefined;
        const { renderSubscription, renderingScheduler } = this.state;
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
            socket, simulation, simCameraBounds,
        } = props;

        const scene = scenes[sceneID]();
        const uri = {
            pathname: `${window.graphistryPath || ''}`,
            href: `${window.graphistryPath || ''}/graph/`,
        };
        const rendererOptions = { pixelRatio, ...simCameraBounds };
        const renderState = initRenderer(scene, simulation, rendererOptions);
        const { hostBuffers: {
            'curPoints': curPointsSource,
            'pointSizes': pointSizesSource,
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
            pointSizesSource,
            vboUpdatesSource,
            vboVersionsSource,
            hasSourceListeners,
            renderingScheduler,
        });
    }
    setupDOMAndSourceListeners(props = {}, state = {}) {

        const { container } = this;
        const { play = 5000,
                socket, simulation,
                selectToolbarItem } = props;
        let {
            renderState,
            curPointsSource,
            hasDOMListeners,
            pointSizesSource,
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
            const rotateSource = setupRotate($(container), camera);
            const scrollSource = setupScroll(
                $(container), simulation,
                camera, { marqueeOn, brushOn }
            );

            cameraChangesSource = Observable.merge(
                rotateSource, scrollSource,// panSource,
                centerSource, zoomInSource, zoomOutSource
            );
        }

        renderSubscription = Observable.merge(
            // Subscribe the global Subjects to their legacy sources.
            // Eventually we need to refactor the render loop to work
            // within the React component lifecycle, then delete this code.
            curPointsSource.do(curPoints),
            pointSizesSource.do(pointSizes),
            vboUpdatesSource.do(vboUpdates),
            vboVersionsSource.do(vboVersions),
            cameraChangesSource.do(cameraChanges),

            vboUpdates
                .filter((update) => update === 'received')
                .take(1)
                .do(() => selectToolbarItem && selectToolbarItem({
                    socket,
                    center: true,
                    id: 'toggle-simulating',
                    selected: this.props.simulating,
                    stop: Observable.race(
                        Observable.timer(play),
                        Gestures.start(container)
                    )
                }))
        )
        .ignoreElements()
        .subscribe();

        resizeSubscription = Observable
            .fromEvent(window, 'resize')
            .debounceTime(200)
            .subscribe(this.onResize);

        this.setState({
            hasDOMListeners,
            hasSourceListeners,
            renderSubscription,
            resizeSubscription
        });
    }
}

Scene = compose(
    getContext({
        play: PropTypes.number,
        socket: PropTypes.object,
        pixelRatio: PropTypes.number,
        simulation: PropTypes.object,
        handleVboUpdates: PropTypes.func,
        // selectToolbarItem: PropTypes.func
    })
)(Scene);

export { Scene };

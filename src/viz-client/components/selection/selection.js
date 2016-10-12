import styles from './styles.less';
import classNames from 'classnames';
import React, { PropTypes } from 'react';
import {
    Subject, Observable,
    Subscription, ReplaySubject
} from 'rxjs';

import {
    curPoints,
    pointSizes,
    cameraChanges
} from 'viz-client/legacy';

import {
    compose,
    toClass,
    getContext,
    shallowEqual,
    mapPropsStream
} from 'recompose';

function onPointTouchStart(event) {

    const { dispatch,
            simulating,
            renderState,
            selectedPoints,
            highlightedPoint,
            renderingScheduler } = onPointTouchStart;

    if (simulating ||
        !dispatch ||
        !renderState ||
        !renderingScheduler ||
        !selectedPoints.length ||
        (highlightedPoint === undefined) || !(
        ~selectedPoints.indexOf(highlightedPoint))) {
        return;
    }

    dispatch({
        event,
        renderingScheduler,
        selectionType: 'select',
        simulating, renderState,
        camera: renderState.camera,
        pointIndexes: selectedPoints,
    });
}

const SelectionArea = ({ rect }) => {
    if (!rect) {
        return null;
    }
    return (
        <div className={classNames({
            [styles['draggable']]: true,
            [styles['selection-area']]: true
        })} style={{
            width: rect.w || 0,
            height: rect.h || 0,
            transform: `translate3d(${
               rect.x || 0}px, ${
               rect.y || 0}px, 0)`
        }}/>
    );
}

const HighlightPoint = ({ index, sizes, points, renderState, onPointSelected }) => {

    if (index === undefined) {
        return null;
    }

    const camera = renderState.camera;
    const scalingFactor = camera.semanticZoom(sizes.length);
    const { x, y } = camera.canvasCoords(points[2 * index],
                                         points[2 * index + 1],
                                         renderState.canvas,
                                         camera.getMatrix());

    // Clamp like in pointculled shader
    const size = Math.max(5, Math.min(
        scalingFactor * sizes[index], 50)) / camera.pixelRatio;

    return (
        <div key={`selection-point-${index}`}
             className={classNames({
                [styles['selection-point']]: true,
                [styles['draggable']]: !!onPointSelected
             })}
             onMouseDown={onPointSelected}
             onTouchStart={onPointSelected}
             style={{
                 borderRadius: size * 0.5,
                 width: size, height: size,
                 transform: `translate3d(${
                    x - (size * 0.5)}px, ${
                    y - (size * 0.5)}px, 0)`
             }}/>
    );
}

const WithPointsAndSizes = mapPropsStream((props) => props.combineLatest(
    pointSizes.map(({ buffer }) => new Uint8Array(buffer)),
    curPoints.map(({ buffer }) => new Float32Array(buffer)),
    cameraChanges.startWith({}),
    Observable.fromEvent(window, 'resize')
              .debounceTime(100)
              .delay(50).startWith(null),
    (props, sizes, points) => ({ ...props, sizes, points })
));

const Selection = compose(
    getContext({
        renderState: PropTypes.object,
        renderingScheduler: PropTypes.object,
    }),
    WithPointsAndSizes
)(({ rect, type,
     simulating,
     sizes, points,
     onPointSelected,
     point: pointIndexes = [],
     renderState, renderingScheduler,
     highlight: { point: highlightPoints = [] } = {} }) => {

    if (simulating || !renderState || !renderingScheduler) {
        highlightPoints = [];
        renderState = undefined;
        onPointSelected = undefined;
        renderingScheduler = undefined;
    }

    const highlightedPoint = highlightPoints[0];

    if (onPointSelected) {
        onPointTouchStart.simulating = simulating;
        onPointTouchStart.renderState = renderState;
        onPointTouchStart.dispatch = onPointSelected;
        onPointTouchStart.selectedPoints = pointIndexes;
        onPointTouchStart.highlightedPoint = highlightedPoint;
        onPointTouchStart.renderingScheduler = renderingScheduler;
    }

    return (
        <div style={{
            width: `100%`,
            height: `100%`,
            position: `absolute`,
            background: `transparent` }}>
            <HighlightPoint key='highlight-point'
                            index={highlightedPoint}
                            renderState={renderState}
                            sizes={sizes} points={points}
                            onPointSelected={onPointTouchStart}/>
            <SelectionArea key='selection-rect' rect={rect}/>
        </div>
    );
});

export { Selection };

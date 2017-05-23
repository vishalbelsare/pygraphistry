import styles from './styles.less';
import classNames from 'classnames';
import React, { PropTypes } from 'react';
import { Observable } from 'rxjs/Observable';
import * as Scheduler from 'rxjs/scheduler/animationFrame';

import {
    curPoints,
    pointSizes,
    cameraChanges,
    hitmapUpdates
} from 'viz-app/client/legacy';

import compose from 'recompose/compose';
import getContext from 'recompose/getContext';
import shallowEqual from 'recompose/shallowEqual';
import mapPropsStream from 'recompose/mapPropsStream';

function SelectionArea({ mask, renderState, onMouseDown, onTouchStart }) {
    if (!mask || !renderState) {
        return null;
    }
    let { tl = {}, br = {} } = mask;
    const { camera, canvas } = renderState;
    tl = camera.canvasCoords(tl.x || 0, tl.y || 0, canvas);
    br = camera.canvasCoords(br.x || 0, br.y || 0, canvas);
    return (
        <div onMouseDown={onMouseDown}
             onTouchStart={onTouchStart}
             className={styles['selection-area']}
             style={{
                 width: (br.x - tl.x) || 0,
                 height: (br.y - tl.y) || 0,
                 transform: `translate3d(${
                    tl.x || 0}px, ${
                    tl.y || 0}px, 0)`
             }}
        />
    );
}

function HighlightPoint({ index, sizes, points, renderState, selectedPoints, onPointSelected }) {

    if (index === undefined) {
        return null;
    }

    const camera = renderState.camera;
    const isDraggable = !!onPointSelected;
    const scalingFactor = camera.semanticZoom(sizes.length);
    const { x, y } = camera.canvasCoords(points[2 * index],
                                         points[2 * index + 1],
                                         renderState.canvas,
                                         camera.getMatrix());

    // Clamp like in pointculled shader
    const size = (Math.max(5, Math.min(
        scalingFactor * sizes[index], 50)) / camera.pixelRatio) || 0;

    const hitArea = Math.max(50, size * 2);
    const selected = selectedPoints && ~selectedPoints.indexOf(index);

    return (
        <div onMouseDown={onPointSelected}
             onTouchStart={onPointSelected}
             className={classNames({
                 [styles['selection-point']]: true,
                 [styles['is-selected']]: !!selected,
             })}
             style={{
                 width: `${hitArea}px`,
                 height: `${hitArea}px`,
                 transform: `translate3d(${
                    (x - (hitArea * 0.5))}px, ${
                    (y - (hitArea * 0.5))}px, 0)`
             }}>
             <div className={styles['selection-point-center']}
                  style={{
                      borderRadius: size * 0.5,
                      width: size, height: size,
                      transform: `translate3d(${
                         ((hitArea - size) * 0.5)}px, ${
                         ((hitArea - size) * 0.5)}px, 0)`
                  }}/>
        </div>
    );
}

const WithPointsAndSizes = mapPropsStream((props) => props
    .combineLatest(
        cameraChanges
            .merge(hitmapUpdates)
            .auditTime(0, Scheduler.animationFrame)
            .startWith({}),
        (props) => props
    )
    .withLatestFrom(
        pointSizes.map(({ buffer }) => new Uint8Array(buffer)),
        curPoints.map(({ buffer }) => new Float32Array(buffer)),
        (props, sizes, points) => ({ ...props, sizes, points })
    )
);

const selectionContainerStyle = {
    top: 0, left: 0,
    bottom: 0, right: 0,
    position: `absolute`,
    background: `rgba(0,0,0,0)`
};

const Selection = compose(
    getContext({
        renderState: PropTypes.object,
        renderingScheduler: PropTypes.object,
    }),
    WithPointsAndSizes
)(({ cursor,
     mask, type,
     simulating,
     sizes, points,
     simulationWidth,
     simulationHeight,
     highlightedEdge,
     highlightedPoint,
     edge: edgeIndexes = [],
     point: pointIndexes = [],
     onSelectedPointTouchStart,
     onSelectionMaskTouchStart,
     renderState, renderingScheduler }) => {

    if (simulating || !renderState || !renderingScheduler) {
        renderState = undefined;
        highlightedPoint = undefined;
        renderingScheduler = undefined;
        onSelectedPointTouchStart = undefined;
        onSelectionMaskTouchStart = undefined;
    }

    onMaskTouchStart.mask = mask;
    onMaskTouchStart.simulating = simulating;
    onMaskTouchStart.renderState = renderState;
    onMaskTouchStart.dispatch = onSelectionMaskTouchStart;
    onMaskTouchStart.renderingScheduler = renderingScheduler;

    onPointTouchStart.simulating = simulating;
    onPointTouchStart.renderState = renderState;
    onPointTouchStart.selectedPoints = pointIndexes;
    onPointTouchStart.highlightedPoint = highlightedPoint;
    onPointTouchStart.dispatch = onSelectedPointTouchStart;
    onPointTouchStart.renderingScheduler = renderingScheduler;

    if (!type) {
        cursor = 'auto';
    }

    if (highlightedEdge !== undefined && highlightedPoint === undefined) {
        cursor = 'edge';
    }

    return (
        <div style={selectionContainerStyle}
             className={classNames({
                 [styles['cursor-' + cursor]]: true,
                 [styles['selection-container']]: true,
             })}>
            <HighlightPoint key='highlight-point'
                            index={highlightedPoint}
                            renderState={renderState}
                            sizes={sizes} points={points}
                            selectedPoints={pointIndexes}
                            simulationWidth={simulationWidth}
                            simulationHeight={simulationHeight}
                            onPointSelected={onPointTouchStart}/>
            <SelectionArea mask={mask}
                           key='selection-mask'
                           renderState={renderState}
                           sizes={sizes} points={points}
                           onMouseDown={onMaskTouchStart}
                           onTouchStart={onMaskTouchStart}
                           simulationWidth={simulationWidth}
                           simulationHeight={simulationHeight}/>
        </div>
    );
});

export { Selection };

function onMaskTouchStart(event) {

    const { mask,
            dispatch,
            simulating,
            renderState,
            renderingScheduler } = onMaskTouchStart;

    if (simulating ||
        !dispatch ||
        !renderState ||
        !renderingScheduler) {
        return;
    }

    dispatch({
        rect: mask, event,
        renderingScheduler,
        selectionMask: mask,
        selectionType: 'window',
        simulating, renderState,
        camera: renderState.camera
    });
}

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

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
    const { target = {} } = event,
          { dataset = {} } = target,
          { pointIndex } = dataset;
    const { dispatch, simulating, renderState } = onPointTouchStart;
    if (true || simulating || !dispatch || typeof pointIndex === 'undefined') {
        return;
    }
    dispatch({
        event,
        simulating, renderState,
        camera: renderState.camera,
        selectionType: 'select',
        // simulationWidth,
        // simulationHeight,
        pointIndex: Number(pointIndex)
    });
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

let Selection = ({ simulating,
                   sizes, points,
                   onPointSelected,
                   point: pointIndexes = [],
                   renderState, renderingScheduler }) => {

    let camera, canvas;

    if (!renderState || simulating) {
        pointIndexes = [];
    } else {
        camera = renderState.camera;
        canvas = renderState.canvas;
        onPointTouchStart.dispatch = onPointSelected;
        onPointTouchStart.simulating = simulating;
        onPointTouchStart.renderState = renderState;
    }

    return (
        <div style={{
            width: `100%`,
            height: `100%`,
            position: `absolute`,
            background: `transparent` }}>{
            pointIndexes.map((pointIndex) => {
                const scalingFactor = camera.semanticZoom(sizes.length);
                const { x, y } = camera.canvasCoords(points[2 * pointIndex],
                                                     points[2 * pointIndex + 1],
                                                     canvas, camera.getMatrix());
                // Clamp like in pointculled shader
                const size = Math.max(5, Math.min(scalingFactor * sizes[pointIndex], 50)) / camera.pixelRatio;
                return (
                    <div data-point-index={pointIndex}
                         key={`selection-point-${pointIndex}`}
                         className={classNames({
                            [styles['selection-point']]: true,
                            [styles['draggable']]: !!onPointSelected
                         })}
                         onMouseDown={onPointSelected && onPointTouchStart}
                         onTouchStart={onPointSelected && onPointTouchStart}
                         style={{
                             borderRadius: size * 0.5,
                             width: size, height: size,
                             transform: `translate3d(${
                                x - (size * 0.5)}px, ${
                                y - (size * 0.5)}px, 0)`
                         }}/>
                );
            })
        }</div>
    );
};

Selection = compose(
    getContext({
        renderState: PropTypes.object,
        renderingScheduler: PropTypes.object,
    }),
    WithPointsAndSizes
)(Selection);

export { Selection };

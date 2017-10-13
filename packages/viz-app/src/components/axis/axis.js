import React from 'react';
import PropTypes from 'prop-types';
import * as Scheduler from 'rxjs/scheduler/animationFrame';
import shallowEqual from 'recompose/shallowEqual';
import mapPropsStream from 'recompose/mapPropsStream';
import compose from 'recompose/compose';
import getContext from 'recompose/getContext';

import { pointSizes, cameraChanges, hitmapUpdates } from 'viz-app/client/legacy';

import styles from './styles.less';

const cameraUpdates = cameraChanges
    .merge(hitmapUpdates)
    .auditTime(0, Scheduler.animationFrame)
    .startWith({})
    .map(() => Scheduler.animationFrame.now());

const keysThatCanCauseRenders = ['axis', 'sceneUpdateTime'];
const WithCamera = mapPropsStream(propsStream =>
    propsStream
        .combineLatest(cameraUpdates, (props, sceneUpdateTime) => ({
            ...props,
            sceneUpdateTime
        }))
        .distinctUntilChanged((prev, curr) =>
            keysThatCanCauseRenders.every(key => shallowEqual(prev[key], curr[key]))
        )
        .withLatestFrom(pointSizes.map(({ buffer }) => new Uint8Array(buffer)), (props, sizes) => ({
            ...props,
            sizes
        }))
);

function AxisReact(props) {
    const { renderState: { camera, canvas }, sizes = [], axis = [] } = props;
    const matrix = camera.getMatrix();

    return (
        <div className={styles['axis']}>
            {axis.map(({ label, y: labelY, r: labelR }, i) => {
                if (typeof labelY !== 'undefined') {
                    const { x, y } = camera.canvasCoords(0, labelY, canvas, matrix);
                    return (
                        <div
                            key={`line-axis-${labelY}-${i}`}
                            className={styles['straightline']}
                            style={{ transform: `translate3d(10px, ${y}px, 0)` }}>
                            <span className={styles['straightlabel']}>{label}</span>
                        </div>
                    );
                } else if (typeof labelR !== 'undefined') {
                    const { x: xMin, y: yMin } = camera.canvasCoords(
                        -labelR,
                        +labelR,
                        canvas,
                        matrix
                    );
                    const { x: xMax, y: yMax } = camera.canvasCoords(
                        +labelR,
                        -labelR,
                        canvas,
                        matrix
                    );
                    return (
                        <div
                            key={`radial-axis-${labelR}-${i}`}
                            className={styles['radial-axis']}
                            style={{
                                width: xMax - xMin,
                                transform: `translate3d(${xMin}px, ${yMin}px, 0)`
                            }}>
                            <span className={styles['radial-axis-label']}>{label}</span>
                        </div>
                    );
                }
            })}
        </div>
    );
}

const Axis = compose(
    getContext({
        renderState: PropTypes.object
    }),
    WithCamera
)(AxisReact);

export { Axis };

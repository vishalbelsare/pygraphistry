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


const keysThatCanCauseRenders = [
    'color', 'background', 'toolbarHeight',
    'labels', 'highlightKey', 'selectionKey',
    'enabled', 'poiEnabled', 'simulating',
    'simulationWidth', 'simulationHeight',
    'sceneUpdateTime', 'sceneSelectionType',
];



class AxisReact extends React.Component {
	constructor(props, context) {
        super(props, context);
    }

    render() {


    	const { renderState: { camera, canvas }, sizes = [], encodings } = this.props;

        const axis =
            encodings && encodings.point && encodings.point.axis && encodings.point.axis.rows
            || [];


        const pixelRatio = camera.pixelRatio;
        const scalingFactor = camera.semanticZoom(sizes.length || 0);
        const matrix = camera.getMatrix();


        return (<div>{
            axis.map(({label, y: labelY, r: labelR}, i) => {

                if (labelY === undefined && labelR === undefined) {
                    return (<div className={`${styles['fullscreen']} ${styles['error']}`} >Please report this graph as an error</div>);
                } else if (labelR === undefined) {
                    const { x, y } = camera.canvasCoords(0, labelY, canvas, matrix);

                    return (
                        <div key={`key_${i}`} className={styles['straightline']} style={{
                            'top': `${Math.round(y)}px`
                            }}>
                            <span className={styles['straightlabel']}>
                                {label}
                            </span>
                        </div>
                    );
                } else { // labelY === undefined
                    const {x: xMin, y: yMin} = camera.canvasCoords(-labelR, -labelR, canvas, matrix);
                    const {x: xMax, y: yMax} = camera.canvasCoords( labelR,  labelR, canvas, matrix);

                    const w = xMax - xMin;
                    const h = yMin - yMax;
                    const xCenter = (xMin + xMax) / 2;
                    const yCenter = (yMin + yMax) / 2;

                    return (
                        <div key={`key_${i}`}
                             className={styles['fullscreen']}>
                            <div className={styles['roundbox']} style={{
                                'height': `${Math.round(h)}px`,
                                'width': `${Math.round(w)}px`,
                                'left': `${Math.round(xMin)}px`,
                                'top': `${Math.round(yMax)}px`
                            }}>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${xMin} ${yMax} ${w} ${h}`}>
                                    <g stroke="#aaaaaa">
                                        <circle cx={xCenter} cy={yCenter} r={w / 2} strokeWidth="1" strokeLinecap="round" strokeDasharray={label ? "1, 3" : "1, 6"} fillOpacity="0"></circle>
                                    </g>
                                </svg>
                                <div className={styles['roundlabel']}>{label}</div>
                            </div>
                        </div>);
                };
            })
        }</div>);

    }


}


const WithCamera = mapPropsStream((props) => props
    .combineLatest(
        cameraUpdates,
        (props, sceneUpdateTime) => ({
        ...props, sceneUpdateTime
    }))
    .distinctUntilChanged((prev, curr) => (
        keysThatCanCauseRenders.every((key) => shallowEqual(prev[key], curr[key]))
    ))
    .withLatestFrom(
        pointSizes.map(({ buffer }) => new Uint8Array(buffer)),
        (props, sizes) => ({
            ...props, sizes
        })
    )
);


const Axis = compose(
    getContext({
        renderState: PropTypes.object
    }),
    WithCamera
)(AxisReact);

export { Axis };

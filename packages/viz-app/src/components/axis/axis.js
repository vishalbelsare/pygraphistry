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
                    const {x: xMin, y: yMin} = camera.canvasCoords(-labelR, +labelR, canvas, matrix);
                    const {x: xMax, y: yMax} = camera.canvasCoords(+labelR, -labelR, canvas, matrix);

                    const w = xMax - xMin;

                    return (
                        <div className={styles['fullscreen']} key={`key_${labelR}`} >
                            <div className={styles['roundbox']} style={{'transform': `translate3d(${Math.round(xMin)}px, ${Math.round(yMin)}px, 0)`}}>
                                <div style={{'border': "1px solid rgba(255,0,0,0.5)", 'borderRadius': '50%', 'position': "absolute", 'height': `${Math.round(w)}px`, 'width': `${Math.round(w)}px`}}>
                                    <div className={styles['roundlabel']}>
                                        {label}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
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

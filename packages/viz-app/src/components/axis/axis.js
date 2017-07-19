import React, { PropTypes } from 'react';
import * as Scheduler from 'rxjs/scheduler/animationFrame';
import shallowEqual from 'recompose/shallowEqual';
import mapPropsStream from 'recompose/mapPropsStream';
import compose from 'recompose/compose';
import getContext from 'recompose/getContext';

import { pointSizes, cameraChanges, hitmapUpdates } from 'viz-app/client/legacy';



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
            axis.map(({label, y: labelY}, i) => {

                const { x, y } = camera.canvasCoords(0, labelY, canvas, matrix);        

                return (<div key={`key_${i}`} style={{
                    'width': 'calc(100% - 200px)',
                    'borderTop': '1px dotted red',
                    'position': 'absolute',
                    'margin': 0,
                    'padding': 0,
                    'left': '100px',
                    'top': `${Math.round(y)}px`        
                }}>
                   <span style={{
                        borderLeft: '1px dotted red',
                        borderRight: '1px dotted red',
                        borderBottom: '1px dotted red',
                        padding: '0 0.5em 0.5em 0.5em',
                        color: 'red',
                        fontWeight: 'bold'
                   }}>{label}</span>
                </div>);

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

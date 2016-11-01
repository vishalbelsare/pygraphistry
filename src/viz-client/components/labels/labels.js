import _ from 'underscore';
import React, { PropTypes } from 'react';
import { Gestures } from 'rxjs-gestures';
import { Observable } from 'rxjs/Observable';
import styles from 'viz-shared/components/labels/style.less';
import { curPoints, vboUpdates, cameraChanges, labelSettings } from 'viz-client/legacy';
import { animationFrame as AnimationFrameScheduler } from 'rxjs/scheduler/animationFrame';

import {
    compose,
    getContext,
    shallowEqual,
    mapPropsStream
} from 'recompose';

import { Label } from './label';

const WithPointsAndMousePosition = mapPropsStream((props) => props
    .combineLatest(
        Gestures.move().startWith({})
            .distinctUntilChanged((a, b) => (
                a.clientX === b.clientX &&
                a.clientY === b.clientY
            )),
        cameraChanges.startWith({}),
        Observable.fromEvent(window, 'resize')
            .debounceTime(100).delay(50).startWith(null),
        (props, { clientX = 0, clientY = 0 }) => ({
            ...props, mouseX: clientX, mouseY: clientY,
        })
    )
    .auditTime(0, AnimationFrameScheduler)
    .withLatestFrom(curPoints
        .map(({ buffer }) => new Float32Array(buffer)),
        (props, points) => ({ ...props, points })
    )
);

class Labels extends React.Component {
    componentWillMount() {
        this.updateLabelSettings({}, this.props);
    }
    componentWillUpdate(nextProps, nextState) {
        this.updateLabelSettings(this.props, nextProps);
    }
    render() {

        let camera, canvas, matrix;
        let { mouseX, mouseY, onLabelsUpdated,
              highlight = null, selection = null,
              labels = [], points = [], children = [],
              renderState = null, renderingScheduler = null
        } = this.props;

        if (!renderState || !renderingScheduler || !(
            camera = renderState.camera) || !(
            canvas = renderState.canvas) || !(
            matrix = camera.getMatrix())) {
            children = [];
        }

        let childIndex = -1;
        const updatesToSend = [];
        const childrenToRender = [];
        const childLen = children.length;

        while (++childIndex < childLen) {

            const label = labels[childIndex];
            const child = children[childIndex];

            if (!child || !label || (
                label.type === undefined) || (
                label.index === undefined || (
                label.title === undefined))) {
                continue;
            }

            const { type, index } = label;
            const { x, y } = (type === 'edge') ?
                label === selection ?
                        getEdgeLabelPos(renderState, renderingScheduler, index)
                    :   camera.canvas2WorldCoords(mouseX, mouseY, canvas, matrix)
                :   { x: points[2 * index], y: points[2 * index + 1] };

            const { x: x2, y: y2 } = camera.canvasCoords(x, y, canvas, matrix);

            updatesToSend.push({
                type,
                id: index,
                pageX: x2,
                pageY: y2,
            });

            childrenToRender.push(React.cloneElement(child, {
                style: {
                    ...(child.props && child.props.style),
                    transform: `translate3d(${x2}px, ${y2}px, 0px)`
                }
            }));
        }

        onLabelsUpdated &&
            (updatesToSend.length) &&
            onLabelsUpdated(updatesToSend);

        return (
            <div className={styles['labels-container']}>
                {childrenToRender}
            </div>
        );
    }
    updateLabelSettings(currProps, nextProps) {
        const { falcor, enabled, poiEnabled,
                renderState, renderingScheduler } = nextProps;
        if (!falcor || !renderState || !renderingScheduler || (
            currProps.enabled === enabled &&
            currProps.poiEnabled === poiEnabled)) {
            return;
        }
        labelSettings.next({ falcor, enabled, poiEnabled,
                             renderState, renderingScheduler });
    }
}

Labels = compose(
    getContext({
        falcor: PropTypes.object,
        renderState: PropTypes.object,
        onLabelsUpdated: PropTypes.func,
        renderingScheduler: PropTypes.object,
    }),
    WithPointsAndMousePosition
)(Labels);

export { Labels };

//Find label position (unadjusted and in model space)
//  Currently just picks a midEdge vertex near the ~middle
//  (In contrast, mouseover effects should use the ~Voronoi position)
//  To convert to canvas coords, use Camera (ex: see labels::renderCursor)
//  TODO use camera if edge goes off-screen
//RenderState * int -> {x: float,  y: float}
function getEdgeLabelPos (renderState, renderingScheduler, edgeIndex) {
    var numRenderedSplits = renderState.config.numRenderedSplits;
    var split = Math.floor(numRenderedSplits/2);

    var appSnapshot = renderingScheduler.appSnapshot;
    var midSpringsPos = appSnapshot.buffers.midSpringsPos;

    var midEdgesPerEdge = numRenderedSplits + 1;
    var midEdgeStride = 4 * midEdgesPerEdge;
    var idx = midEdgeStride * edgeIndex + 4 * split;

    return {x: midSpringsPos[idx], y: midSpringsPos[idx + 1]};
}


/*{

const propTypes = {
    opacity: React.PropTypes.number,
    background: React.PropTypes.any,
    color: React.PropTypes.any,

    poiEnabled: React.PropTypes.bool,
    enabled: React.PropTypes.bool,

    onClick: React.PropTypes.func,
    onFilter: React.PropTypes.func,
    onExclude: React.PropTypes.func,
    onPinChange: React.PropTypes.func,

    hideNull: React.PropTypes.bool,
    selectedColumns: React.PropTypes.object,
    labels: React.PropTypes.array
};

const defaultProps = {
    opacity: 1,
    background: 'red',
    color: 'white',
    poiEnabled: true,
    enabled: true,
    onClick: (({type, title}) => console.log('clicked', {type, title})),
    onFilter: (({type, field, value}) => console.log('click filter', {type, field, value})),
    onExclude: (({type, field, value}) => console.log('click exclude', {type, field, value})),
    onPinChange: (({type, title}) => console.log('click pin change', {type, title})),
    hideNull: true,
    labels: [
            type: 'point',
            id: 'bullwinkle',
            title: "the greatest moose",

            showFull: false, // expanded when :hover or .on
            pinned: true,

            x: 200,
            y: 30,

            fields: [
                //{key, value, ?displayName, dataType: 'color' or ?}
                {key: 'field01', value: 0},
                {key: 'field02', value: 'hello'},
                {key: 'field03', value: 'world'},
                {key: 'field04', value: 2000},
                {key: 'field05', value: '#f00', dataType: 'color'},
                {key: 'field06', value: '#ff0000', dataType: 'color'},
                {key: 'field07', value: undefined},
                {key: 'field08', value: null},
                {key: 'field09', value: 'another'},
                {key: 'field10isareallylongnameok', value: 'and another'},
                {key: 'field11 is also a really long one', value: 24},
                {key: 'field12', value: 'field value is quite long and will likely overflow'},
                {key: 'field13', value: 'fieldvalueisquitelongandwilllikelyoverflow'},
                {key: 'field14', value: 'and another'},
                {key: 'field15', value: 'and another'},
                {key: 'field16', value: 'and another'},
                {key: 'field17', value: 'and another'}
            ]
    ]
}

class Labels extends React.Component {

    constructor(props) {
        super(props);
        console.log('labels props', props);
    }

    render() {

        if (!this.props.enabled) return <div className={styles['labels-container']} />;

        return (
            <div className={styles['labels-container']}>
                {
                    this.props.labels.map( (label) => (
                        <DataLabel {...this.props} label={label} /> ))
                }
            </div>
        );
    }
}

Labels.propTypes = propTypes;
Labels.defaultProps = defaultProps;

Labels = getContext({
    renderState: PropTypes.object,
    renderingScheduler: PropTypes.object,
})(Labels);


export { Labels };

}*/

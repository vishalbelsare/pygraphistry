import { toProps } from '@graphistry/falcor';
import { Labels } from 'viz-app/containers/labels';
import { Renderer } from 'viz-app/containers/renderer';
import { Settings } from 'viz-app/containers/settings';
import { container } from '@graphistry/falcor-react-redux';
import { Selection } from 'viz-app/containers/selection';
import { Scene as SceneComponent } from 'viz-app/components/scene';

let Scene = ({
        selectLabel,
        sceneShiftDown,
        sceneMouseMove,
        sceneTouchStart,
        simulationWidth,
        simulationHeight,
        onSelectedPointTouchStart,
        onSelectionMaskTouchStart,
        id, simulating, labels = {},
        release = {}, renderer = {},
        selection = {}, highlight = {}, ...props } = {}) => (
    <SceneComponent key='scene'
                    sceneID={id}
                    release={release}
                    selection={selection}
                    edges={renderer.edges}
                    simulating={simulating}
                    points={renderer.points}
                    onShiftDown={sceneShiftDown}
                    onMouseMove={sceneMouseMove}
                    onTouchStart={sceneTouchStart}
                    simulationWidth={simulationWidth}
                    simulationHeight={simulationHeight}
                    highlightEnabled={labels && labels.highlightEnabled}
                    {...props}>
        <Renderer key='renderer'
                  data={renderer}
                  simulating={simulating}
                  simulationWidth={simulationWidth}
                  simulationHeight={simulationHeight}/>
        <Selection key='selection'
                   data={selection}
                   simulating={simulating}
                   simulationWidth={simulationWidth}
                   simulationHeight={simulationHeight}
                   onSelectedPointTouchStart={onSelectedPointTouchStart}
                   onSelectionMaskTouchStart={onSelectionMaskTouchStart}
                   highlightedEdge={highlight && highlight.edge && highlight.edge[0]}
                   highlightedPoint={highlight && highlight.point && highlight.point[0]}/>
        <Labels key='labels'
                data={labels}
                simulating={simulating}
                selectLabel={selectLabel}
                simulationWidth={simulationWidth}
                simulationHeight={simulationHeight}
                sceneSelectionType={selection.type}/>
    </SceneComponent>
);

Scene = container({
    renderLoading: true,
    fragment: (scene = {}) => `{
        id, simulating,
        release: { tag, buildNumber },
        ... ${ Settings.fragment(scene) },
        labels: ${ Labels.fragment(scene.labels) },
        renderer: ${ Renderer.fragment(scene.renderer) },
        highlight: ${ Selection.fragment(scene.highlight) },
        selection: ${ Selection.fragment(scene.selection) }
    }`
})(Scene);

export { Scene };

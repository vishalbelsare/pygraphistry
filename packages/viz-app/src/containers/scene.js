import { toProps } from '@graphistry/falcor';
import { Labels } from 'viz-app/containers/labels';
import { Renderer } from 'viz-app/containers/renderer';
import { Settings } from 'viz-app/containers/settings';
import { container } from '@graphistry/falcor-react-redux';
import { Selection } from 'viz-app/containers/selection';
import { Scene as SceneComponent } from 'viz-app/components/scene';

let Scene = ({
        selectLabel,
        sceneMouseMove,
        sceneTouchStart,
        onSelectedPointTouchStart,
        onSelectionMaskTouchStart,
        id, simulating, labels = {},
        release = {}, renderer = {},
        selection = {}, highlight = {}, ...props } = {}) => (
    <SceneComponent sceneID={id}
                    release={release}
                    selection={selection}
                    edges={renderer.edges}
                    simulating={simulating}
                    points={renderer.points}
                    mouseMove={sceneMouseMove}
                    touchStart={sceneTouchStart}
                    {...props}>
        <Renderer key='renderer'
                  data={renderer}
                  simulating={simulating}/>
        <Selection key='selection'
                   data={selection}
                   simulating={simulating}
                   onSelectedPointTouchStart={onSelectedPointTouchStart}
                   onSelectionMaskTouchStart={onSelectionMaskTouchStart}
                   highlightedPoint={highlight && highlight.point && highlight.point[0]}/>
        <Labels key='labels'
                data={labels}
                simulating={simulating}
                selectLabel={selectLabel}
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

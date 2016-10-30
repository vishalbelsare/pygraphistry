import { toProps } from '@graphistry/falcor';
import { Labels } from 'viz-shared/containers/labels';
import { Renderer } from 'viz-shared/containers/renderer';
import { Settings } from 'viz-shared/containers/settings';
import { container } from '@graphistry/falcor-react-redux';
import { Selection } from 'viz-shared/containers/selection';
import SceneComponent from 'viz-shared/components/scene';

let Scene = ({
        onSelectedPointTouchStart,
        onSelectionMaskTouchStart,
        id, simulating, labels = {},
        release = {}, renderer = {},
        selection = {}, highlight = {}, ...props } = {}) => (
    <div>
      <Labels key='labels' data={labels} simulating={simulating}/>
      <SceneComponent selection={selection}
                      simulating={simulating}
                      edges={renderer.edges}
                      points={renderer.points}
                      sceneID={id} {...props}
                      release={release}>
          <Renderer key='renderer'
                    data={renderer}
                    simulating={simulating}/>
          <Selection key='selection'
                     data={selection}
                     highlight={highlight}
                     simulating={simulating}
                     onSelectedPointTouchStart={onSelectedPointTouchStart}
                     onSelectionMaskTouchStart={onSelectionMaskTouchStart}/>
      </SceneComponent>
    </div>
);

Scene = container((scene = {}) => {
    return `{
        id, simulating, release: { tag, buildNumber },
        ... ${ Settings.fragment(scene) },
        labels: ${ Labels.fragment(scene.labels) },
        renderer: ${ Renderer.fragment(scene.renderer) },
        highlight: ${ Selection.fragment(scene.highlight) },
        selection: ${ Selection.fragment(scene.selection) }
    }`;
})(Scene);

export { Scene };

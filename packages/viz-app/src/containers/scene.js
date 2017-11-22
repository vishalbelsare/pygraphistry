import { Row } from 'react-bootstrap';
import { toProps } from '@graphistry/falcor';
import { Labels } from 'viz-app/containers/labels';
import { Axis } from 'viz-app/containers/axis';
import { Histogram } from 'viz-app/containers/histograms';
import { LegendContainer as Legend } from 'viz-app/containers/legend';
import { TimebarContainer as Timebar } from 'viz-app/containers/timebar';
import { Renderer } from 'viz-app/containers/renderer';
import { container } from '@graphistry/falcor-react-redux';
import { Selection } from 'viz-app/containers/selection';
import { Scene as SceneComponent } from 'viz-app/components/scene';
import { Settings, withControlContainer } from 'viz-app/containers/settings';

const SceneOptionToggle = withControlContainer(
    ({ id, name, props, value = false, setValue, ...rest }) => (
        <label>
            <input
                type="checkbox"
                checked={value}
                id={`${id}-input`}
                onChange={({ target }) =>
                    setValue({ id, ...rest, value: (value = target.checked) })}
            />
            {name}
        </label>
    )
);

const emptyArray = [];

let Scene = (
    {
        settings,
        selectLabel,
        toolbarHeight,
        sceneShiftDown,
        sceneMouseMove,
        sceneTouchStart,
        simulationWidth,
        simulationHeight,
        onSelectedPointTouchStart,
        onSelectionMaskTouchStart,
        id,
        simulating,
        labels = {},
        axis = {},
        legend = {},
        release = {},
        renderer = {},
        selection = {},
        highlight = {},
        legendTypeHisto = {},
        legendPivotHisto = {},
        timebarHisto = {},
        ...props
    } = {}
) => (
    <SceneComponent
        key="scene"
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
        backgroundColor={
            (renderer && renderer.background && renderer.background.color) || '#323238'
        }
        pruneIsolatedOption={<SceneOptionToggle data={settings && settings[0] && settings[0][3]} />}
        labelPOIOption={
            <SceneOptionToggle
                data={labels && labels.settings && labels.settings[0] && labels.settings[0][4]}
            />
        }
        {...props}>
        <Renderer
            key="renderer"
            data={renderer}
            simulating={simulating}
            simulationWidth={simulationWidth}
            simulationHeight={simulationHeight}
            axis={
                (axis &&
                    axis.encodings &&
                    axis.encodings.point &&
                    axis.encodings.point.axis &&
                    axis.encodings.point.axis.rows) ||
                emptyArray
            }
        />
        <Axis key="axis" data={axis} />
        <Selection
            key="selection"
            data={selection}
            simulating={simulating}
            simulationWidth={simulationWidth}
            simulationHeight={simulationHeight}
            onSelectedPointTouchStart={onSelectedPointTouchStart}
            onSelectionMaskTouchStart={onSelectionMaskTouchStart}
            highlightedEdge={highlight && highlight.edge && highlight.edge[0]}
            highlightedPoint={highlight && highlight.point && highlight.point[0]}
        />
        <Labels
            key="labels"
            data={labels}
            simulating={simulating}
            selectLabel={selectLabel}
            toolbarHeight={toolbarHeight}
            simulationWidth={simulationWidth}
            simulationHeight={simulationHeight}
            sceneSelectionType={selection.type}
        />
        <Legend
            cols={legendTypeHisto}
            visible={legend.visible}
            legendPivotHisto={legendPivotHisto}
            encodings={labels && labels.encodings}
        />
        {/* <Timebar timebarHisto={timebarHisto} /> */}
    </SceneComponent>
);

Scene = container({
    renderLoading: true,
    fragment: (scene = {}) => `{
        id, simulating,
        release: { tag, buildNumber },
        ... ${Settings.fragment(scene)},
        axis: ${Axis.fragment(scene.axis)},
        legend: ${Legend.fragment(scene.legend)},
        legendTypeHisto: ${Histogram.fragment(scene.legendTypeHisto)},
        legendPivotHisto: ${Histogram.fragment(scene.legendPivotHisto)},
        timebarHisto: ${Timebar.fragment(scene.timebarHisto)},
        labels: ${Labels.fragment(scene.labels)},
        labels: { settings: { 0: { 4: ${SceneOptionToggle.fragment()}}}},
        renderer: ${Renderer.fragment(scene.renderer)},
        highlight: ${Selection.fragment(scene.highlight)},
        selection: ${Selection.fragment(scene.selection)}
    }`
})(Scene);

export { Scene };

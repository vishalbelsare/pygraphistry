import { Settings } from 'viz-shared/containers/settings';
import { container } from '@graphistry/falcor-react-redux';
import {
    Label as LabelComponent,
    Labels as LabelsComponent
} from 'viz-shared/components/labels';

import {
    addFilter,
    addExclusion,
    labelMouseMove,
} from 'viz-shared/actions/labels';

let Label = container({
    fragment: () => `{
        type, index, title, columns
    }`,
    dispatchers: {
        onFilter: addFilter,
        onExclude: addExclusion,
    }
})(LabelComponent);

let Labels = ({ simulating,
                selectLabel,
                labelMouseMove,
                sceneSelectionType,
                enabled, poiEnabled, opacity,
                foreground: { color: color } = {},
                background: { color: background } = {},
                point = [], highlight, selection, ...props }) => {

    let labels = [];

    if (enabled) {
        if (poiEnabled && point && point.length) {
            labels = point.slice(0);
        }
        if (selection && highlight && (
            selection.type === highlight.type) && (
            selection.index === highlight.index)) {
            highlight = undefined;
        }
        if (selection) {
            labels = labels.filter(({ index }) => (
                index !== selection.index
            )).concat(selection);
        }
        if (highlight) {
            labels = labels.filter(({ index }) => (
                index !== highlight.index
            )).concat(highlight);
        }
    }

    return (
        <LabelsComponent labels={labels}
                         enabled={enabled}
                         highlight={highlight}
                         selection={selection}
                         poiEnabled={poiEnabled}
                         {...props}>
        {enabled && labels.filter(Boolean).map((label, index) =>
            <Label data={label}
                   color={color}
                   opacity={opacity}
                   key={`label-${index}`}
                   simulating={simulating}
                   background={background}
                   pinned={label === selection}
                   onLabelSelected={selectLabel}
                   onLabelMouseMove={labelMouseMove}
                   hasHighlightedLabel={!!highlight}
                   sceneSelectionType={sceneSelectionType}
                   showFull={label === highlight || label === selection}/>
        ) || []}
        </LabelsComponent>
    );
};

Labels = container({
    fragment: ({ edge = [], point = [], settings } = {}) => `{
        id, name, timeZone,
        opacity, enabled, poiEnabled,
        ['background', 'foreground']: { color },
        ...${ Settings.fragment({ settings }) },
        ['highlight', 'selection']: ${
            Label.fragment()
        },
        point: {
            length, [0...${point.length || 0}]: ${
                Label.fragment()
            }
        }
    }`,
    dispatchers: {
        labelMouseMove,
    }
})(Labels);

export { Labels, Label }

import Color from 'color';
import { Settings } from 'viz-app/containers/settings';
import { container } from '@graphistry/falcor-react-redux';
import {
    Label as LabelComponent,
    Labels as LabelsComponent
} from 'viz-app/components/labels';

import { labelMouseMove } from 'viz-app/actions/labels';
import { addFilter, addExclusion } from 'viz-app/actions/expressions';

let Label = container({
    renderLoading: false,
    fragment: (fragment, { pinned, showFull } = {}) => {
        return (false && !pinned && !showFull) &&
            `{ type, index, title }` ||
            `{ type, index, title, columns }`;
    },
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
                encodings,
                point = [], highlight, selection, ...props }) => {

    let labels = [];

    color = new Color(color).rgbaString();
    background = new Color(background).rgbaString();

    if (poiEnabled && point && point.length) {
        labels = point.slice(0);
    }
    if (selection && highlight && (
        selection.type === highlight.type) && (
        selection.index === highlight.index)) {
        highlight = undefined;
    }
    if (selection) {
        labels = labels.filter(({ type, index }) => (
            type !== selection.type ||
            index !== selection.index
        )).concat(selection);
    }
    if (highlight) {
        labels = labels.filter(({ type, index }) => (
            type !== highlight.type ||
            index !== highlight.index
        ));
        if (sceneSelectionType) {
            highlight = undefined
        } else {
            labels.push(highlight);
        }
    }

    return (
        <LabelsComponent labels={labels}
                         enabled={enabled}
                         highlight={highlight}
                         selection={selection}
                         poiEnabled={poiEnabled}
                         {...props}>
        {enabled && labels.filter(Boolean).map((label) => {
            const key = label === selection ? 'selection' :
                        label === highlight ? 'highlight' : label.index;
            return (
                <Label data={label}
                       color={color}
                       opacity={opacity}
                       key={`label-${key}`}
                       encodings={encodings}
                       simulating={simulating}
                       background={background}
                       pinned={label === selection}
                       onLabelSelected={selectLabel}
                       onLabelMouseMove={labelMouseMove}
                       hasHighlightedLabel={!!highlight}
                       sceneSelectionType={sceneSelectionType}
                       showFull={label === highlight || label === selection}/>
           );
        }) || []}
        </LabelsComponent>
    );
};

Labels = container({
    renderLoading: false,
    fragment: ({ edge = [], point = [], settings } = {}) => `{
        id, name, timeZone,
        opacity, enabled, poiEnabled,
        renderer: {
            background: { color }
        },
        ['background', 'foreground']: { color },
        ...${ Settings.fragment({ settings }) },
        ['highlight', 'selection']: ${
            Label.fragment()
        },
        point: {
            length, [0...${point.length || 0}]: ${
                Label.fragment()
            }
        },
        encodings: {
            point: { color, size, icon },
            edge: { color, icon }
        }
    }`,
    dispatchers: {
        labelMouseMove,
    }
})(Labels);

export { Labels, Label }

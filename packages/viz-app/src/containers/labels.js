import Color from 'color';
import { toProps } from '@graphistry/falcor';
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
            `{ type, index, title, globalIndex }` ||
            `{ type, index, title, globalIndex, columns }`;
    },
    dispatchers: {
        onFilter: addFilter,
        onExclude: addExclusion,
    }
})(LabelComponent);

let Labels = ({ simulating,
                selectLabel,
                labelMouseMove,
                enabled, opacity,
                sceneSelectionType,
                poiEnabled, highlightEnabled,
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
        if (!highlightEnabled || sceneSelectionType || simulating) {
            highlight = undefined;
        } else {
            labels.push(highlight);
        }
    }

    return (
        <LabelsComponent color={color}
                         labels={labels}
                         enabled={enabled}
                         highlight={highlight}
                         selection={selection}
                         simulating={simulating}
                         poiEnabled={poiEnabled}
                         background={background}
                         highlightEnabled={highlightEnabled}
                         highlightKey={getLabelKey(highlight)}
                         selectionKey={getLabelKey(selection)}
                         {...props}>
        {enabled && labels.filter(Boolean).map((label) => (
            <Label data={label}
                   color={color}
                   opacity={opacity}
                   encodings={encodings}
                   simulating={simulating}
                   background={background}
                   key={getLabelKey(label)}
                   pinned={label === selection}
                   onLabelSelected={selectLabel}
                   onLabelMouseMove={labelMouseMove}
                   hasHighlightedLabel={!!highlight}
                   sceneSelectionType={sceneSelectionType}
                   showFull={label === highlight || label === selection}/>
       )) || []}
        </LabelsComponent>
    );
};

function getLabelKey(label) {
    return label && `label-${label.type}-${label.globalIndex}` || 'no-label';
}

Labels = container({
    renderLoading: false,
    fragment: ({ point = [], settings, highlight, selection } = {}) => `{
        id, name, opacity, timeZone,
        enabled, poiEnabled, highlightEnabled,
        renderer: {
            background: { color }
        },
        ['background', 'foreground']: { color },
        ...${ Settings.fragment({ settings }) },
        point: ${ Label.fragments(point) },
        highlight: ${ Label.fragment(highlight) },
        selection: ${ Label.fragment(selection) },
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

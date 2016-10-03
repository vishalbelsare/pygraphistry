import Color from 'color';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

export function labels(workbookId, viewId) {
    const view = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        labelsByType: { edge: {}, point: {} },
        labels: {
            id: 'labels',
            name: 'Labels',
            edges: [], points: [],
            opacity: 1, enabled: true,
            timeZone: '', poiEnabled: true,
            selection: $ref(`${view}.selection.label`),
            foreground: { color: new Color('#1f1f33') },
            background: { color: new Color('#ffffff').alpha(0.9) },
            settings: [
                $ref(`${view}.labels.options`),
            ],
            controls: [{
                selected: false,
                view: $ref(`${view}`),
                id: 'toggle-label-settings',
                name: 'Label settings',
            }],
            options: {
                id: 'label-options',
                name: '',
                length: 5, ...[{
                    id: 'text-color',
                    type: 'color',
                    name: 'Text Color',
                    value: $ref(`${view}.labels.foreground.color`),
                    // stateKey: 'color',
                    // state: $ref(`${view}.labels.foreground`)
                }, {
                    id: 'background-color',
                    type: 'color',
                    name: 'Background Color',
                    value: $ref(`${view}.labels.background.color`),
                    // stateKey: 'color',
                    // state: $ref(`${view}.labels.background`)
                }, {
                    id: 'transparency',
                    type: 'discrete',
                    name: 'Transparency',
                    props: {
                        min: 0, max: 100,
                        step: 1, scale: 'percent'
                    },
                    value: $ref(`${view}.labels.opacity`),
                    // stateKey: 'opacity',
                    // state: $ref(`${view}.labels`)
                }, {
                    id: 'show-labels',
                    type: 'bool',
                    name: 'Show Labels',
                    value: $ref(`${view}.labels.enabled`),
                    // stateKey: 'enabled',
                    // state: $ref(`${view}.labels`)
                }, {
                    id: 'show-points-of-interest',
                    type: 'bool',
                    name: 'Show Points of Interest',
                    value: $ref(`${view}.labels.poiEnabled`),
                    // stateKey: 'poiEnabled',
                    // state: $ref(`${view}.labels`)
                }]
            }
        }
    };
}

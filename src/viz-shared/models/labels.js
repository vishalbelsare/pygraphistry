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
                id: 'toggle-label-settings',
                name: 'Label settings',
                type: 'toggle',
                value: 0,
                values: $atom([[
                    $value(`${view}.panels.left`, $atom(undefined))
                ], [
                    $value(`${view}.panels.left`, $ref(`${view}.labels`)),
                    $value(`${view}.scene.controls[1].value`, $atom(0)),
                    $value(`${view}.layout.controls[0].value`, $atom(0)),
                    $value(`${view}.filters.controls[0].value`, $atom(0)),
                    $value(`${view}.exclusions.controls[0].value`, $atom(0)),
                ]])
            }],
            options: {
                id: 'label-options',
                name: '',
                length: 5, ...[{
                    id: 'text-color',
                    type: 'color',
                    name: 'Text Color',
                    stateKey: 'color',
                    state: $ref(`${view}.labels.foreground`)
                }, {
                    id: 'background-color',
                    type: 'color',
                    name: 'Background Color',
                    stateKey: 'color',
                    state: $ref(`${view}.labels.background`)
                }, {
                    id: 'transparency',
                    type: 'discrete',
                    name: 'Transparency',
                    props: {
                        min: 0, max: 100,
                        step: 1, scale: 'percent'
                    },
                    stateKey: 'opacity',
                    state: $ref(`${view}.labels`)
                }, {
                    id: 'show-labels',
                    type: 'bool',
                    name: 'Show Labels',
                    stateKey: 'enabled',
                    state: $ref(`${view}.labels`)
                }, {
                    id: 'show-points-of-interest',
                    type: 'bool',
                    name: 'Show Points of Interest',
                    stateKey: 'poiEnabled',
                    state: $ref(`${view}.labels`)
                }]
            }
        }
    };
}

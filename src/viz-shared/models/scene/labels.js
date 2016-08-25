import Color from 'color';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';

export function labels(scene) {
    return {
        labelsByType: { edge: {}, point: {} },
        labels: {
            id: 'labels',
            name: 'Labels',
            edge: [], point: [],
            opacity: 1, enabled: true,
            timeZone: '', poiEnabled: true,
            selection: $ref(`${scene}.selection.label`),
            foreground: { color: new Color('#1f1f33') },
            background: { color: new Color('#ffffff').alpha(0.9) },
            settings: [
                $ref(`${scene}.labels.options`),
            ],
            options: {
                id: 'label-options',
                name: '',
                length: 5, ...[{
                    id: 'text-color',
                    type: 'color',
                    name: 'Text Color',
                    stateKey: 'color',
                    state: $ref(`${scene}.labels.foreground`)
                }, {
                    id: 'background-color',
                    type: 'color',
                    name: 'Background Color',
                    stateKey: 'color',
                    state: $ref(`${scene}.labels.background`)
                }, {
                    id: 'transparency',
                    type: 'discrete',
                    name: 'Transparency',
                    props: {
                        min: 0, max: 100,
                        step: 1, scale: 'percent'
                    },
                    stateKey: 'opacity',
                    state: $ref(`${scene}.labels`)
                }, {
                    id: 'show-labels',
                    type: 'bool',
                    name: 'Show Labels',
                    stateKey: 'enabled',
                    state: $ref(`${scene}.labels`)
                }, {
                    id: 'show-points-of-interest',
                    type: 'bool',
                    name: 'Show Points of Interest',
                    stateKey: 'poiEnabled',
                    state: $ref(`${scene}.labels`)
                }]
            }
        }
    };
}

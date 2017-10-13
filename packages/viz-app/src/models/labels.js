import Color from 'color';
import { ref as $ref, atom as $atom, pathValue as $value } from '@graphistry/falcor-json-graph';

export function labels(view) {
    return {
        labelsByType: { edge: {}, point: {} },
        labels: {
            id: 'labels',
            name: 'Labels',
            edge: [],
            point: [],
            timeZone: '',
            opacity: 1,
            enabled: true,
            poiEnabled: true,
            highlightEnabled: true,
            foreground: { color: new Color('#fff') },
            background: { color: new Color('#2e2e2e').alpha(1.0) },
            renderer: $ref(`${view}.scene.renderer`),
            encodings: $ref(`${view}.encodings`),
            settings: [$ref(`${view}.labels.options`)],
            controls: [
                {
                    selected: false,
                    id: 'toggle-label-settings',
                    name: 'Label settings',
                    type: 'settings'
                }
            ],
            options: {
                id: 'label-options',
                name: '',
                length: 5,
                ...[
                    {
                        id: 'text-color',
                        type: 'color',
                        name: 'Text Color',
                        value: $ref(`${view}.labels.foreground.color`)
                    },
                    {
                        id: 'background-color',
                        type: 'color',
                        name: 'Background Color',
                        value: $ref(`${view}.labels.background.color`)
                        // }, {
                        //     id: 'transparency',
                        //     type: 'discrete',
                        //     name: 'Transparency',
                        //     props: {
                        //         min: 0, max: 100,
                        //         step: 1, scale: 'percent'
                        //     },
                        //     value: $ref(`${view}.labels.opacity`)
                    },
                    {
                        id: 'show-labels',
                        type: 'bool',
                        name: 'Show Labels',
                        value: $ref(`${view}.labels.enabled`)
                    },
                    {
                        id: 'show-label-highlight',
                        type: 'bool',
                        name: 'Show Label on Hover',
                        value: $ref(`${view}.labels.highlightEnabled`)
                    },
                    {
                        id: 'show-points-of-interest',
                        type: 'bool',
                        name: 'Show Points of Interest',
                        value: $ref(`${view}.labels.poiEnabled`)
                    }
                ]
            }
        }
    };
}

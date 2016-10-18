import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

export function selection(view) {
    return {
        highlight: {
            label: null,
            edge: [],
            point: [],
        },
        selection: {
            type: null,
            rect: null,
            label: null,
            edge: [], point: [],
            histogramsById: {},
            controls: [{
                selected: false,
                id: 'toggle-select-nodes',
                name: 'Select nodes',
            }, {
                selected: false,
                id: 'toggle-window-nodes',
                name: 'Data brush',
            }]
        }
    }
}

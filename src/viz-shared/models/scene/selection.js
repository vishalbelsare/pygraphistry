import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';

export function selection(view, scene) {
    return {
        selection: {
            type: $atom(undefined),
            rect: $atom(undefined),
            label: $atom(undefined),
            edge: [], point: [],
            controls: [{
                id: 'toggle-select-nodes',
                name: 'Select nodes',
                type: 'toggle',
                stateKey: 'type',
                state: $ref(`${scene}.selection`),
                value: $atom(undefined),
                values: $atom(['select', $atom(undefined)]),
                // $value(`${view}.panels.bottom`, [$ref(`${view}.inspector`), $atom(undefined)])
            }, {
                id: 'toggle-window-nodes',
                name: 'Data brush',
                type: 'toggle',
                stateKey: 'type',
                state: $ref(`${scene}.selection`),
                value: $atom(undefined),
                values: $atom(['window', $atom(undefined)]),
                // $value(`${view}.panels.bottom`, [$ref(`${view}.inspector`), $atom(undefined)])
            }]
        }
    }
}

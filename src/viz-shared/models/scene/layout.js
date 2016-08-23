import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';

export function layout(scene) {
    return {
        layout: {
            id: 'layout',
            name: 'Layout',
            settings: [
                $ref(`${scene}.layout.options`)
            ],
            options: {
                id: 'layout-options',
                name: 'Layout',
                length: 0
            }
        }
    };
}

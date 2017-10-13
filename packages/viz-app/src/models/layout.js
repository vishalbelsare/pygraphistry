import { ref as $ref, atom as $atom, pathValue as $value } from '@graphistry/falcor-json-graph';

export function layout(view) {
    return {
        layout: {
            id: 'layout',
            name: 'Layout',
            settings: [$ref(`${view}.layout.options`)],
            controls: [
                {
                    selected: false,
                    id: 'toggle-layout-settings',
                    name: 'Layout settings',
                    type: 'settings'
                }
            ],
            options: {
                id: 'layout-options',
                name: 'Layout',
                length: 0
            }
        }
    };
}

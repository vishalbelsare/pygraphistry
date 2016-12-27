import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

export function timebar(view) {
    return {
        timebar: {
            open: false,
            id: 'timebar',
            name: 'Timebar',
            controls: [{
                selected: false,
                id: 'toggle-timebar',
                name: 'Timebar',
            }]
        }
    };
}

import { expression } from './expressions';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

export function exclusions(view) {
    return {
        exclusionsById: {},
        exclusions: {
            length: 0,
            id: 'exclusions',
            name: 'Exclusions',
            templates: $ref(`${view}.columns`),
            controls: [{
                selected: false,
                id: 'toggle-exclusions',
                name: 'Exclusions'
            }]
        }
    }
}

export function exclusion(name, query) {
    return {
        ...expression(name, query),
        expressionType: 'exclusion'
    };
}

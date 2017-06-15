import { expression } from './expressions';
import { simpleflake } from 'simpleflakes';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

export function filters(view, defaultFilter = {}) {

    const { id: defaultFilterId } = defaultFilter;
    const defaultFilters = defaultFilterId === undefined ? [] : [
        $ref(`${view}.expressionsById['${defaultFilterId}']`)
    ];

    return {
        filters: {
            id: 'filters',
            name: 'Filters',
            ...defaultFilters,
            length: defaultFilters.length,
            templates: $ref(`${view}.columns`),
            controls: [{
                selected: false,
                id: 'toggle-filters',
                name: 'Filters',
                type: 'settings',
                items: $ref(`${view}.filters`)
            }]
        }
    };
}

export function filter(query) {
    return {
        ...expression(query),
        expressionType: 'filter'
    };
}

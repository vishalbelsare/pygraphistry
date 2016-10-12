import { expression } from './expressions';
import { simpleflake } from 'simpleflakes';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

export function filters(workbookId, viewId, defaultFilter = {}) {

    const view = `workbooksById['${workbookId}'].viewsById['${viewId}']`;

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
            templates: $ref(`${view}.expressionTemplates`),
            controls: [{
                selected: false,
                id: 'toggle-filters',
                name: 'Filters',
            }]
        }
    };
}

export function filter(input, name, dataType, attribute) {
    return {
        ...expression(input, name, dataType, attribute),
        expressionType: 'filter'
    };
}

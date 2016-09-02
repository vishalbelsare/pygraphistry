import { simpleflake } from 'simpleflakes';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';

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
            templates: $ref(`${view}.expressions`),
            controls: [{
                id: 'toggle-filters',
                name: 'Filters',
                type: 'toggle',
                stateKey: 'left',
                state: $ref(`${view}.panels`),
                value: $atom(undefined),
                values: $atom([$ref(`${view}.filters`), $atom(undefined)])
            }]
        }
    };
}

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
                id: 'toggle-filters',
                name: 'Filters',
                type: 'toggle',
                value: 0,
                values: $atom([[
                    $value(`${view}.panels.left`, $atom(undefined))
                ], [
                    $value(`${view}.panels.left`, $ref(`${view}.filters`)),
                    $value(`${view}.scene.controls[1].value`, $atom(0)),
                    $value(`${view}.labels.controls[0].value`, $atom(0)),
                    $value(`${view}.layout.controls[0].value`, $atom(0)),
                    $value(`${view}.exclusions.controls[0].value`, $atom(0)),
                ]])
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

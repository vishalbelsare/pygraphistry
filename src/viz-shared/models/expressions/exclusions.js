import { expression } from './expressions';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

export function exclusions(workbookId, viewId) {
    const view = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        exclusionsById: {},
        exclusions: {
            length: 0,
            id: 'exclusions',
            name: 'Exclusions',
            templates: $ref(`${view}.expressionTemplates`),
            controls: [{
                id: 'toggle-exclusions',
                name: 'Exclusions',
                type: 'toggle',
                value: 0,
                values: $atom([[
                    $value(`${view}.panels.left`, $atom(undefined))
                ], [
                    $value(`${view}.panels.left`, $ref(`${view}.exclusions`)),
                    $value(`${view}.scene.controls[1].value`, $atom(0)),
                    $value(`${view}.labels.controls[0].value`, $atom(0)),
                    $value(`${view}.layout.controls[0].value`, $atom(0)),
                    $value(`${view}.sets.controls[0].value`, $atom(0)),
                    $value(`${view}.filters.controls[0].value`, $atom(0)),
                ]])
            }]
        }
    }
}

export function exclusion(input, name, dataType, attribute) {
    return {
        ...expression(input, name, dataType, attribute),
        expressionType: 'exclusion'
    };
}

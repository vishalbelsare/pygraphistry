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
                selected: false,
                id: 'toggle-exclusions',
                name: 'Exclusions'
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

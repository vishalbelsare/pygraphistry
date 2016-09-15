import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

import Color from 'color';
import { addExpressionHandler } from './expressions';

import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function exclusions(path, base) {
    return function exclusions({ loadViewsById, addExpression }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const addExclusion = addExpressionHandler({
            loadViewsById, addExpression, expressionType: 'exclusion'
        });

        return [{
            returns: `*`,
            get: getValues,
            route: `${base}['exclusions'][{keys}]`,
        }, {
            get: getValues,
            route: `${base}['exclusions'].controls[{keys}]`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['exclusions'].controls[{keys}][{keys}]`
        }, , {
            call: addExclusion,
            route: `${base}['exclusions'].add`
        }];
    }
}

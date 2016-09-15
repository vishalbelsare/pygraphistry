import {
    ref as $ref,
    atom as $atom,
    error as $error,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

import Color from 'color';
import { addExpressionHandler } from './expressions';

import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function filters(path, base) {
    return function filters({ loadViewsById, addExpression }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const addFilter = addExpressionHandler({
            loadViewsById, addExpression, expressionType: 'filter'
        });

        return [{
            returns: `*`,
            get: getValues,
            route: `${base}['filters'][{keys}]`,
        }, {
            get: getValues,
            route: `${base}['filters'].controls[{keys}]`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['filters'].controls[{keys}][{keys}]`
        }, {
            call: addFilter,
            route: `${base}['filters'].add`
        }, {
            call: removeFilter,
            route: `${base}['filters'].remove`
        }];

        function removeFilter(path, args) {

        }
    }
}

import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import {
    addExpressionHandler,
    removeExpressionHandler
} from './expressions';

import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function filters(path, base) {
    return function filters({ loadViewsById, addExpression, removeExpressionById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const addFilter = addExpressionHandler({
            openPanel: true,
            panelSide: 'left',
            listName: 'filters',
            addItem: addExpression,
            expressionType: 'filter',
        });
        const removeFilter = removeExpressionHandler({
            listName: 'filters',
            expressionType: 'filter',
            removeItem: removeExpressionById
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
    }
}

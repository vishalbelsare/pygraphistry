import {
    addExpressionHandler,
    removeExpressionHandler
} from './expressions';

import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function exclusions(path, base) {
    return function exclusions({ loadViewsById, addExpression, removeExpressionById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const addExclusion = addExpressionHandler({
            listName: 'exclusions',
            addItem: addExpression,
            expressionType: 'exclusion'
        });
        const removeExclusion = removeExpressionHandler({
            listName: 'exclusions',
            expressionType: 'exclusion',
            removeItem: removeExpressionById
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
        }, {
            call: removeExclusion,
            route: `${base}['exclusions'].remove`
        }];
    }
}

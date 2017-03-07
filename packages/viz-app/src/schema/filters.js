import { getHandler, setHandler } from 'viz-app/router';
import { filter as createFilter } from 'viz-app/models/expressions';
import { addExpressionHandler, removeExpressionHandler } from './expressions';

export function filters(path, base) {
    return function filters({ loadViewsById, maskDataframe, addExpression, removeExpressionById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const addFilter = function(addExpr) {
            return function(path, callArgs) {
                const [componentType, name, dataType, value] = callArgs;
                const input = callArgs.length === 1 && callArgs[0] || undefined;
                return addExpr.call(this, path, [createFilter(input ? input : {
                    name, value, dataType, componentType
                })]);
            }
        }(addExpressionHandler({
            maskDataframe,
            openPanel: true,
            panelSide: 'left',
            listName: 'filters',
            addItem: addExpression,
            expressionType: 'filter',
        }));

        const removeFilter = removeExpressionHandler({
            maskDataframe,
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

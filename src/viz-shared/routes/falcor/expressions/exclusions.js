import { getHandler, setHandler } from 'viz-shared/routes';
import { exclusion as createExclusion } from 'viz-shared/models/expressions';
import { addExpressionHandler, removeExpressionHandler } from './expressions';

export function exclusions(path, base) {
    return function exclusions({ loadViewsById, addExpression, removeExpressionById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const addExclusion = function(addExpr) {
            return function(path, callArgs) {
                const [componentType, name, dataType, value] = callArgs;
                const input = callArgs.length === 1 && callArgs[0] || undefined;
                return addExpr.call(this, path, [createExclusion(input ? input : {
                    name, value, dataType, componentType
                })]);
            }
        }(addExpressionHandler({
            openPanel: true,
            panelSide: 'left',
            listName: 'exclusions',
            addItem: addExpression,
            expressionType: 'exclusion',
        }));

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

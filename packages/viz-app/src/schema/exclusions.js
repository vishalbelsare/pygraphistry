import { getHandler, setHandler } from 'viz-app/router';
import { exclusion as createExclusion } from 'viz-app/models/expressions';
import { addExpressionHandler, removeExpressionHandler } from './expressions';

export function exclusions(path, base) {
  return function exclusions({
    loadViewsById,
    maskDataframe,
    addExpression,
    removeExpressionById
  }) {
    const getValues = getHandler(path, loadViewsById);
    const setValues = setHandler(path, loadViewsById);
    const addExclusion = (function(addExpr) {
      return function(path, callArgs) {
        const [componentType, name, dataType, value] = callArgs;
        const input = (callArgs.length === 1 && callArgs[0]) || undefined;
        return addExpr.call(this, path, [
          createExclusion(
            input
              ? input
              : {
                  name,
                  value,
                  dataType,
                  componentType
                }
          )
        ]);
      };
    })(
      addExpressionHandler({
        maskDataframe,
        openPanel: true,
        panelSide: 'left',
        listName: 'exclusions',
        addItem: addExpression,
        expressionType: 'exclusion'
      })
    );

    const removeExclusion = removeExpressionHandler({
      maskDataframe,
      listName: 'exclusions',
      expressionType: 'exclusion',
      removeItem: removeExpressionById
    });

    return [
      {
        returns: `*`,
        get: getValues,
        route: `${base}['exclusions'][{keys}]`
      },
      {
        get: getValues,
        route: `${base}['exclusions'].controls[{keys}]`
      },
      {
        get: getValues,
        set: setValues,
        route: `${base}['exclusions'].controls[{keys}][{keys}]`
      },
      ,
      {
        call: addExclusion,
        route: `${base}['exclusions'].add`
      },
      {
        call: removeExclusion,
        route: `${base}['exclusions'].remove`
      }
    ];
  };
}

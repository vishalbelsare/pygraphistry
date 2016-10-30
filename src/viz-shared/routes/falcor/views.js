import { Observable } from 'rxjs';
import {
    ref as $ref,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';
import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function views(path, base) {
    return function views({ appendColumn,
                            loadViewsById,
                            moveSelectedNodes }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);

        return [{
            get: getValues,
            route: `${base}['id', 'title']`,
            returns: `String`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['panels']['left', 'right', 'bottom']`,
            returns: `Reference`
        }, {
            call: addColumn,
            route: `${base}['columns'].add`,
        }, {
            returns: `*`,
            get: getValues,
            route: `${base}['columns'][{keys}]`,
        }, {
            returns: `*`,
            get: getValues,
            route: `${base}['columns'][{keys}][{keys}]`,
        }, {
            call: movePointSelection,
            route: `${base}['moveSelectedNodes']`
        }];

        function addColumn(path, [componentType, name, values, dataType]) {
            const workbookIds = [].concat(path[1]);
            const viewIds = [].concat(path[3]);

            return loadViewsById({
                workbookIds, viewIds
            })
            .mergeMap(({ workbook, view }) => {

                const workbookId = workbook.id;
                const viewId = view.id;
                const columns = appendColumn({
                    view, componentType, name, values, dataType
                });

                return columns.reduce((values, column = {}, index) => values.concat(
                    Object.keys(column).map((key) => $value(
                        path(index, key), column[key]
                    ))),
                    [$value(path('length'), columns.length)]
                );

                function path(...keys) {
                    return [
                        'workbooksById', workbookId,
                            'viewsById', viewId,
                              'columns', ...keys
                    ];
                }
            });
        }

        function movePointSelection(path, [{ x = 0, y = 0 } = {}]) {
            const workbookIds = [].concat(path[1]);
            const viewIds = [].concat(path[3]);
            return moveSelectedNodes({
                workbookIds, viewIds, coords: { x, y }
            });
        }
    }
}

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
    return function views({ tickLayout,
                            appendColumn,
                            maskDataframe,
                            loadViewsById,
                            moveSelectedNodes }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const setPruneOrphansAndMaskDataframe = setHandler(path, loadViewsById,
            (node, key, value, path, { workbook, view }) => Observable.defer(() => {

                view[key] = value;

                let obs = Observable.of(0);
                const { filters, exclusions } = view;

                if ((filters && filters.length) || (exclusions && exclusions.length)) {
                                                  // ignore dataframe errors
                    obs = maskDataframe({ view }).catch((err) => Observable.of(0));
                }

                return obs
                    .mapTo({ path, value })
                    .concat(Observable.of($invalidate(
                        path.slice(0, -1).concat('labelsByType')
                    )));
            }));

        return [{
            get: getValues,
            route: `${base}['id', 'title']`,
            returns: `String`
        }, {
            get: getValues,
            set: setPruneOrphansAndMaskDataframe,
            route: `${base}.pruneOrphans`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['panels']['left', 'right', 'bottom']`,
            returns: `Reference`
        }, {
            call: tickLayoutFn,
            route: `${base}.tick`,
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

        function tickLayoutFn(path) {
            const workbookIds = [].concat(path[1]);
            const viewIds = [].concat(path[3]);

            return loadViewsById({
                workbookIds, viewIds
            })
            .mergeMap(({ workbook, view }) => {
                const workbookId = workbook.id;
                const viewId = view.id;
                tickLayout({workbook, view});
                return [];
            });
        }

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

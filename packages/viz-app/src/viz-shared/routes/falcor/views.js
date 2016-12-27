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

                const viewPath = path.slice(0, -1);
                let obs = Observable.of({ path, value });
                const { filters, exclusions } = view;

                if ((filters && filters.length) || (exclusions && exclusions.length)) {
                    obs = maskDataframe({ view }).mapTo({ path, value });
                }

                return obs.concat(Observable.of($invalidate(
                    [...viewPath, 'labelsByType']
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
            }).mergeMap(({ view }) => tickLayout({
                view
            }));
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
                    [
                        $value(path('length'), columns.length),
                        $invalidate(`
                            workbooksById['${workbookId}']
                                .viewsById['${viewId}']
                                .labelsByType`),
                        $invalidate(`
                            workbooksById['${workbookId}']
                                .viewsById['${viewId}']
                                .inspector.rows`)
                    ]
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

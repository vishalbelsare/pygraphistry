import { Observable } from 'rxjs';
import * as Scheduler from 'rxjs/scheduler/async';
import { getHandler, setHandler } from 'viz-app/router';
import { $value, $invalidate } from '@graphistry/falcor-json-graph';

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

                const viewPath = path.slice(0, -1);
                const { filters, exclusions } = view;

                return Observable.of(
                    $value(path, node[key] = value),
                    $value([...viewPath, 'session', 'status'], 'default'),
                    $value([...viewPath, 'session', 'progress'], 100),
                    $value([...viewPath, 'session', 'message'], 'Updating graph')
                )
                .concat(maskDataframe({ view })
                    .subscribeOn(Scheduler.async, 100)
                    .mergeMap(() => [
                        $invalidate([...viewPath, 'labelsByType']),
                        $invalidate([...viewPath, 'inspector', 'rows']),
                        $invalidate([...viewPath, 'selection', 'histogramsById']),
                        $value([...viewPath, 'session', 'status'], 'success'),
                        $value([...viewPath, 'session', 'progress'], 100),
                        $value([...viewPath, 'session', 'message'], null)
                    ])
                );
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

                view.inspector.rows = undefined;
                view.componentsByType = undefined;

                const workbookId = workbook.id;
                const viewId = view.id;
                const viewPath = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
                const columns = appendColumn({ view, componentType, name, values, dataType });

                return columns.reduce((values, column = {}, index) => values.concat(
                    Object.keys(column).map((key) => $value(
                        colPath(index, key), column[key]
                    ))),
                    [
                        $invalidate(`${viewPath}.componentsByType`),
                        $invalidate(`${viewPath}.labelsByType`),
                        $invalidate(`${viewPath}.inspector.rows`),
                        $value(colPath('length'), columns.length)
                    ]
                );

                function colPath(...keys) {
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

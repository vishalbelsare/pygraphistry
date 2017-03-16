import { Observable } from 'rxjs';
import * as Scheduler from 'rxjs/scheduler/async';
import { getHandler, setHandler } from 'viz-app/router';
import { $atom, $value, $invalidate } from '@graphistry/falcor-json-graph';

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

                const viewId = view.id;
                const workbookId = workbook.id;
                const columnIndex = view.columns && view.columns.length || 0;
                const viewPath = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
                const column = appendColumn({ view, componentType, name, values, dataType });

                if (!column) {
                    return [];
                }

                return [
                    $invalidate(`${viewPath}.labelsByType`),
                    $invalidate(`${viewPath}.inspector.rows`),
                    $invalidate(`${viewPath}.componentsByType`),
                    $value(`${viewPath}.columns.length`, columnIndex + 1),
                    ...Object.keys(column).map((key) => $value(
                        `${viewPath}.columns[${columnIndex}]['${key}']`, column[key]
                    ))
                ];
            });
        }

        function movePointSelection(path, [{ x = 0, y = 0 } = {}]) {
            const workbookIds = [].concat(path[1]);
            const viewIds = [].concat(path[3]);
            return moveSelectedNodes({
                workbookIds, viewIds, coords: { x, y }
            })
            .map(({ workbook, view, points }) => $value(
                `workbooksById['${workbook.id}']` +
                    `.viewsById['${view.id}']` +
                    `.selection.point`,
                $atom(points)
            ));
        }
    }
}

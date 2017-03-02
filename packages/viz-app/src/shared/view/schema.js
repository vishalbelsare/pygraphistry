import { Observable } from 'rxjs/Observable';
import * as Scheduler from 'rxjs/scheduler/async';
import { withSchema } from '@graphistry/falcor-react-schema';
import { $ref, $value, $invalidate } from '@graphistry/falcor-json-graph';

import { Layout } from 'viz-schema/layout';
import { Toolbar, getToolbarRefRoute } from 'viz-schema/toolbar';

export default withSchema((QL, { get, set }, services) => {

    const { loadViewsById } = services;
    const readViewsByIdHandler = {
        get: get(loadViewsById)
    };
    const readWriteViewsByIdHandler = {
        get: get(loadViewsById),
        set: set(loadViewsById)
    };
    const readWritePruneOrphansHandler = {
        get: get(loadViewsById),
        set: set(loadViewsById, pruneOrphansAndMaskDataframeSetRoute(services))
    };

    const readToolbarHandler = { get: getToolbarRefRoute(services) };
    const tickLayoutCallHandler = { call: tickLayoutCallRoute(services) };
    const moveSelectedNodesCallHandler = { call: moveSelectedNodesCallRoute(services) };

    return QL`{
        ['id', 'title']: ${
            readViewsByIdHandler
        },
        pruneOrphans: ${
            readWritePruneOrphansHandler
        },
        panels: {
            ['left', 'right', 'bottom']: ${
                readWriteViewsByIdHandler
            }
        },
        tick: ${ tickLayoutCallHandler },
        moveSelectedNodes: ${ moveSelectedNodesCallHandler },

        layout: ${ Layout.schema(services) },
        toolbar: ${ readToolbarHandler },
        toolbarsById: {
            [{ keys: toolbarIds }]: ${
                Toolbar.schema(services)
            }
        }
    }`;
});

function tickLayoutCallRoute({ loadViewsById, tickLayout }) {
    return function tickLayoutCallHandler({ workbookIds, viewIds }) {
        return loadViewsById({ workbookIds, viewIds })
            .mergeMap(({ view }) => tickLayout({ view }));
    }
}

function moveSelectedNodesCallRoute({ moveSelectedNodes }) {
    return function moveSelectedNodesCallHandler(
        { workbookIds, viewIds }, [{ x = 0, y = 0 } = {}]
    ) {
        return moveSelectedNodes({
            workbookIds, viewIds, coords: { x, y }
        });
    }
}

function pruneOrphansAndMaskDataframeSetRoute({ maskDataframe }) {
    return function pruneOrphansAndMaskDataframeSetHandler(node, key, value, path, { view }) {

        const viewPath = path.slice(0, -1);
        const { filters, exclusions } = view;

        let obs = Observable.of({ path, value: node[key] = value });

        if ((filters && filters.length > 1) || (exclusions && exclusions.length)) {
            obs = obs.concat(
                maskDataframe({ view })
                    .subscribeOn(Scheduler.async, 100)
                    .mergeMapTo(Observable.of(
                        $invalidate([...viewPath, 'labelsByType']),
                        $invalidate([...viewPath, 'componentsByType']),
                        $invalidate([...viewPath, 'inspector', 'rows']),
                        $invalidate([...viewPath, 'selection', 'histogramsById'])
                    )
                )
            );
        }

        return obs;
    }
}

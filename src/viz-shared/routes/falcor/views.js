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
    return function views({ loadViewsById }) {

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
            call: moveSelectedNodes,
            route: `${base}['moveSelectedNodes']`
        }];

        function moveSelectedNodes(path, [{ x = 0, y = 0 } = {}]) {

            if (x === 0 && y === 0) {
                return [];
            }

            const workbookIds = [].concat(path[1]);
            const viewIds = [].concat(path[3]);

            return loadViewsById({
                workbookIds, viewIds
            })
            .mergeMap(({ workbook, view }) => {

                const { nBody, selection = {} } = view;
                const { point: points = [] } = selection;

                if (!nBody || points.length <= 0) {
                    return [];
                }

                return Observable
                    .from(nBody.simulator.moveNodesByIds(points, { x, y }))
                    .do(() => {
                        const { server } = nBody;
                        if (server && server.updateVboSubject) {
                            server.updateVboSubject.next(nBody);
                        }
                    })
                    .ignoreElements()
            })
            .map(mapObjectsToAtoms)
            .catch(captureErrorStacks);
        }
    }
}

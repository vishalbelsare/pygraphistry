import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';
import Color from 'color';
import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function sets(path, base) {
    return function sets({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const getSets = getHandler(path.concat('set'), loadSetsById);

        return [{
            returns: `*`,
            get: getValues,
            route: `${base}['sets'][{keys}]`,
        }, {
            get: getValues,
            route: `${base}['sets'].controls[{keys}]`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['sets'].controls[{keys}][{keys}]`
        }, {
            returns: `*`,
            get: getSets,
            route: `${base}['setsById'][{keys}][{keys}]`,
        }];

        function loadSetsById({
            workbookIds, viewIds, setIds, controlIds, options
        }) {
            return loadViewsById({
                workbookIds, viewIds, options
            })
            .mergeMap(
                ({ workbook, view }) => setIds,
                ({ workbook, view }, setId) => ({
                    workbook, view, set: view.setsById[setId]
                })
            );
        }
    }
}

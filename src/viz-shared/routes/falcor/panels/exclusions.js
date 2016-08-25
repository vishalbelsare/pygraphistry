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

export function exclusions(path, base) {
    return function exclusions({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const getExclusions = getHandler(path.concat('exclusion'), loadExclusionsById);

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
        }, {
            returns: `*`,
            get: getExclusions,
            route: `${base}['exclusionsById'][{keys}][{keys}]`,
        }];

        function loadExclusionsById({
            workbookIds, viewIds, exclusionIds, controlIds, options
        }) {
            return loadViewsById({
                workbookIds, viewIds, options
            })
            .mergeMap(
                ({ workbook, view }) => exclusionIds,
                ({ workbook, view }, exclusionId) => ({
                    workbook, view, exclusion: view.exclusionsById[exclusionId]
                })
            );
        }
    }
}

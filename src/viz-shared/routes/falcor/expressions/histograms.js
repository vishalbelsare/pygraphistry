import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';
import Color from 'color';
import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function histograms(path, base) {
    return function histograms({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const getHistograms = getHandler(path.concat('histogram'), loadHistogramsById);

        return [{
            returns: `*`,
            get: getValues,
            route: `${base}['histograms'][{keys}]`,
        }, {
            get: getValues,
            route: `${base}['histograms'].controls[{keys}]`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['histograms'].controls[{keys}][{keys}]`
        }, {
            returns: `*`,
            get: getHistograms,
            route: `${base}['histogramsById'][{keys}][{keys}]`,
        }];

        function loadHistogramsById({
            workbookIds, viewIds, histogramIds, controlIds, options
        }) {
            return loadViewsById({
                workbookIds, viewIds, options
            })
            .mergeMap(
                ({ workbook, view }) => histogramIds,
                ({ workbook, view }, histogramId) => ({
                    workbook, view, histogram: view.histogramsById[histogramId]
                })
            );
        }

    }
}

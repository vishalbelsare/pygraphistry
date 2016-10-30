import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';
import { Observable } from 'rxjs';
import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function histograms(path, base) {
    return function histograms({ loadViewsById, loadHistogramsById, loadSelectionHistogramsById }) {

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
            get: getHistogramTypeReference,
            route: `${base}['histogramsById'][{keys}]['global', 'masked']`
        }, {
            returns: `*`,
            get: getHistograms,
            route: `${base}['histogramsById'][{keys}][
                'dataType',
                'bins', 'binValues',
                'numBins', 'numValues',
                'type', 'attribute', 'binType',
                'binWidth', 'minValue', 'maxValue'
            ]`
        }, {
            get: getSelectionHistograms,
            route: `${base}['selection']['histogramsById'][{keys}][
                'dataType',
                'bins', 'binValues',
                'numBins', 'numValues',
                'type', 'attribute', 'binType',
                'binWidth', 'minValue', 'maxValue'
            ]`
        // }, {
        //     returns: `*`,
        //     get: getHistograms,
        //     route: `${base}['histogramsById'][{keys}][{integers}][
        //         'min', 'max', 'count',
        //         'isSingular', 'representative'
        //     ]`,
        // }, {
        //     returns: `*`,
        //     get: getSelectionHistograms,
        //     route: `${base}['selection']['histogramsById'][{keys}][{integers}][
        //         'min', 'max', 'count',
        //         'isSingular', 'representative'
        //     ]`
        }];

        function getHistogramTypeReference(path) {
            const basePath = path.slice(0, path.length - 3);
            const histogramIds = [].concat(path[path.length - 2]);
            const histogramTypes = [].concat(path[path.length - 1]);
            return histogramIds.reduce((values, histogramId) => {
                return histogramTypes.reduce((values, histogramType) => {
                    const refPath = histogramType === 'global' ?
                        basePath.concat('histogramsById') :
                        basePath.concat('selection', 'histogramsById');
                    refPath.push(histogramId);
                    values.push($value(
                        basePath.concat(
                            'histogramsById', histogramId, histogramType
                        ), $ref(refPath)));
                    return values;
                }, values);
            }, []);
        }

        function getSelectionHistograms(path) {
            const restPath = path.slice(7);
            const workbookIds = [].concat(path[1]);
            const viewIds = [].concat(path[3]);
            const histogramIds = [].concat(path[6]);
            return loadSelectionHistogramsById({
                workbookIds, viewIds, histogramIds, masked: true
            })
            .mergeMap(
                ({ workbook, view, histogram }) => getHandler([], () =>
                    Observable.of(histogram)
                ).call(this, restPath),
                ({ workbook, view, histogram }, { path, value }) => $value([
                    'workbooksById', workbook.id,
                        'viewsById', view.id, 'selection',
                        'histogramsById', histogram.id, ...path
                    ], value
                )
            );
        }
    }
}

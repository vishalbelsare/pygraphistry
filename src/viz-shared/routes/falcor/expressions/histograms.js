import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

import { Observable } from 'rxjs';

import {
    addExpressionHandler,
    removeExpressionHandler
} from './expressions';

import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function histograms(path, base) {
    return function histograms({ addHistogram,
                                 loadViewsById,
                                 loadHistogramsById,
                                 removeHistogramById,
                                 computeMaskForHistogramBin,
                                 loadSelectionHistogramsById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const getHistograms = getHandler(path.concat('histogram'), loadHistogramsById);
        const setHistograms = setHandler(path.concat('histogram'), loadHistogramsById);

        const addHistogramHandler = addExpressionHandler({
            addItem: addHistogram,
            itemName: 'histogram',
            listName: 'histograms',
            mapName : 'histogramsById',
        });

        const removeHistogramHandler = removeExpressionHandler({
            listName: 'histograms',
            itemIDName: 'histogramId',
            removeItem: removeHistogramById,
        });

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
            call: addHistogramHandler,
            route: `${base}['histograms'].add`
        }, {
            call: removeHistogramHandler,
            route: `${base}['histograms'].remove`
        }, {
            returns: `*`,
            set: setHistograms,
            route: `${base}['histogramsById'][{keys}].yScale`
        }, {
            call: highlightBin,
            route: `${base}['histogramsById'][{keys}].highlightBin`
        }, {
            get: getHistogramTypeReference,
            route: `${base}['histogramsById'][{keys}]['global', 'masked']`
        }, {
            returns: `*`,
            get: getHistograms,
            route: `${base}['histogramsById'][{keys}][
                'id', 'name', 'yScale',
                'numElements', 'maxElements',
                'binType', 'binWidth', 'numBins',
                'isMasked', 'dataType', 'componentType'
            ]`
        }, {
            returns: `*`,
            get: getHistograms,
            route: `${base}['histogramsById'][{keys}].bins[{keys}]`
        }, {
            returns: `*`,
            get: getHistograms,
            route: `${base}['histogramsById'][{keys}].bins[{keys}][
                'count', 'values', 'exclude'
            ]`
        }, {
            returns: `*`,
            get: getSelectionHistograms,
            route: `${base}['selection']['histogramsById'][{keys}][
                'id', 'name', 'yScale',
                'numElements', 'maxElements',
                'binType', 'binWidth', 'numBins',
                'isMasked', 'dataType', 'componentType'
            ]`
        }, {
            returns: `*`,
            get: getSelectionHistograms,
            route: `${base}['selection']['histogramsById'][{keys}].bins[{keys}]`
        }, {
            returns: `*`,
            get: getSelectionHistograms,
            route: `${base}['selection']['histogramsById'][{keys}].bins[{keys}][
                'count', 'values', 'exclude'
            ]`
        }];

        function highlightBin(path, [index]) {

            const workbookIds = [].concat(path[1]);
            const viewIds = [].concat(path[3]);
            const histogramIds = [].concat(path[5]);

            return loadHistogramsById({
                workbookIds, viewIds, histogramIds, refresh: false
            })
            .mergeMap(
                ({ workbook, view, histogram = {} }) => {
                    const { bins = [] } = histogram;
                    if (index >= bins.length) {
                        return Observable.of({});
                    }
                    return computeMaskForHistogramBin({ view, histogram, bin: bins[index] });
                },
                ({ workbook, view, histogram }, maskedComponents) => ({
                    workbook, view, histogram, maskedComponents
                })
            )
            .mergeMap(({ workbook, view, histogram, maskedComponents: masked }) => {

                let darken = false;
                const values = Object
                    .keys(masked)
                    .map((componentType, x, y, elements = masked[componentType]) => $value(`
                        workbooksById['${workbook.id}']
                            .viewsById['${view.id}']
                            .highlight['${componentType}']`,
                        $atom((darken = darken || (
                                        elements && elements.length > 0))
                            && elements || elements)
                    ));

                return values.concat($value(`
                        workbooksById['${workbook.id}']
                            .viewsById['${view.id}']
                            .highlight.darken`,
                        darken
                ));
            });
        }

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
                        ),
                        $ref(refPath)
                    ));
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

import { Observable } from 'rxjs';
import * as Scheduler from 'rxjs/scheduler/async';
import { getHandler, setHandler } from 'viz-app/router';
import { printExpression } from 'viz-app/models/expressions';
import { addExpressionHandler, removeExpressionHandler } from './expressions';
import { histogramFilterQuery } from 'viz-app/models/expressions/histograms';
import { filter as createFilter }  from 'viz-app/models/expressions/filters';
import { $ref, $atom, $value, $invalidate } from '@graphistry/falcor-json-graph';
import { histogram as createHistogram } from 'viz-app/models/expressions/histograms';

export function histograms(path, base) {
    return function histograms({ addHistogram,
                                 addExpression,
                                 loadViewsById,
                                 maskDataframe,
                                 loadHistogramsById,
                                 removeHistogramById,
                                 removeExpressionById,
                                 computeMaskForHistogramBin,
                                 loadSelectionHistogramsById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const getHistograms = getHandler(path.concat('histogram'), loadHistogramsById);
        const setHistograms = setHandler(path.concat('histogram'), loadHistogramsById);

        const addFilter = addExpressionHandler({
            maskDataframe,
            openPanel: true,
            panelSide: 'left',
            listName: 'filters',
            addItem: addExpression,
            expressionType: 'filter',
        });

        const removeFilter = removeExpressionHandler({
            maskDataframe,
            listName: 'filters',
            expressionType: 'filter',
            removeItem: removeExpressionById
        });

        const addHistogramHandler = function(addExpr) {
            return function(path, callArgs) {
                const [componentType, name, dataType] = callArgs;
                const histogram = createHistogram({ name, dataType, componentType });
                return addExpr.call(this, path, [histogram]);
            }
        }(addExpressionHandler({
            openPanel: false,
            panelSide: 'right',
            addItem: addHistogram,
            itemName: 'histogram',
            listName: 'histograms',
            mapName : 'histogramsById',
        }));

        const removeHistogramHandler = removeExpressionHandler({
            listName: 'histograms',
            itemIDName: 'histogramId',
            mapName : 'histogramsById',
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
            call: updateHistogramFilterHandler,
            route: `${base}['histogramsById'][{keys}].filter`
        }, {
            returns: `*`,
            get: getHistograms,
            route: `${base}['histogramsById'][{keys}][
                'id', 'name',
                'range', 'filter', 'yScale',
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
                'id', 'name',
                'range', 'filter', 'yScale',
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

        function updateHistogramFilterHandler(path, binIndexes = []) {

            const workbookIds = [].concat(path[1]);
            const viewIds = [].concat(path[3]);
            const histogramIds = [].concat(path[5]);

            return loadHistogramsById({
                workbookIds, viewIds, histogramIds, refresh: false
            })
            .mergeMap(({ workbook, view, histogram }) => {

                if (!histogram) {
                    return Observable.empty();
                }

                // Todo: move most of this into a service so we can run this route on the client.

                const { selection, expressionsById = {} } = view;
                const viewPath = `
                        workbooksById['${workbook.id}']
                            .viewsById['${view.id}']`;
                const histogramPath = `${viewPath}
                    .histogramsById['${histogram.id}']`;

                let create = false;
                let { bins = [], filter: filterRef } = histogram;
                let filter, query = histogramFilterQuery(histogram, binIndexes);

                if (filterRef) {
                    filter = expressionsById[
                        filterRef.value[filterRef.value.length - 1]];
                }

                // Filter arguments that are out of bounds.
                binIndexes = binIndexes.filter((index) =>
                    index >= 0 && index < bins.length && bins[index]);

                // If no bin indexes, or no bins in this histogram,
                // remove the current filter.
                if (!query || !binIndexes.length || !bins.length) {
                    histogram.range = [];
                    histogram.filter = undefined;
                    if (!filterRef || !filter) {
                        // If no filter for this histogram, just return an invalidation
                        return Observable.of(
                            $invalidate(`${histogramPath}.filter`),
                                 $value(`${histogramPath}.range`, []));
                    }
                    return removeFilter
                        .call(this, path, [filter.id])
                        .startWith($invalidate(`${histogramPath}.filter`),
                                        $value(`${histogramPath}.range`, []));
                } else if (!filter) {
                    create = true;
                    filter = createFilter({
                        query,
                        name: histogram.name,
                        dataType: histogram.dataType,
                        componentType: histogram.componentType
                    });
                }

                const filterPath = `${viewPath}
                    .expressionsById['${filter.id}']`;

                histogram.range = binIndexes;
                histogram.filter = $ref(filterPath);

                if (create) {
                    return addFilter.call(this, path, [{
                        ...filter,
                        readOnly: true,
                        histogramId: histogram.id
                    }])
                    .startWith($value(`${filterPath}.enabled`, true),
                               $value(`${histogramPath}.range`, histogram.range),
                               $value(`${histogramPath}.filter`, histogram.filter));
                }

                expressionsById[filter.id] = filter = {
                    ...filter,
                    query, enabled: true,
                    input: printExpression(query)
                };

                return Observable.of(
                    $value(`${viewPath}.session.status`, 'default'),
                    $value(`${viewPath}.session.progress`, null),
                    $value(`${viewPath}.session.message`, 'Updating graph')
                ).concat(maskDataframe({ view })
                    .subscribeOn(Scheduler.async, 100)
                    .mergeMap(() => {

                        view.inspector.rows = undefined;
                        view.componentsByType = undefined;

                        // If the view has histograms, invalidate the
                        // relevant fields so they're recomputed if the
                        // histograms panel is open, or the next time the
                        // panel is opened.
                        const pathValues = [
                            $invalidate(`${viewPath}.componentsByType`),
                            $invalidate(`${viewPath}.labelsByType`),
                            $invalidate(`${viewPath}.inspector.rows`),
                            $value(`${viewPath}.highlight.darken`, false),
                            $value(`${histogramPath}.range`, binIndexes),
                            $value(`${histogramPath}.filter`, histogram.filter),
                            $value(`${filterPath}.input`, filter.input),
                            $value(`${filterPath}.enabled`, filter.enabled),
                        ];

                        if (selection && selection.mask &&
                            selection.type === 'window') {
                            pathValues.push($invalidate(`
                                ${viewPath}.selection.histogramsById`));
                        }

                        return pathValues.concat(
                            $value(`${viewPath}.session.status`, 'success'),
                            $value(`${viewPath}.session.progress`, 100),
                            $value(`${viewPath}.session.message`, null)
                        );
                    })
                );
            });
        }

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
                    return computeMaskForHistogramBin({
                        basedOnCurrentDataframe: true,
                        view, histogram, bin: bins[index]
                    });
                },
                ({ workbook, view, histogram }, maskedComponents) => ({
                    workbook, view, histogram, maskedComponents
                })
            )
            .mergeMap(({ workbook, view, histogram, maskedComponents: masked = {} }) => {

                let darken = false;
                const values = Object
                    .keys(masked)
                    .map((componentType, x, y, elements = masked[componentType]) => $value(`
                        workbooksById['${workbook.id}']
                            .viewsById['${view.id}']
                            .highlight['${componentType}']`,
                        $atom((darken = darken || (elements && elements.length > 0)) &&
                                                   elements || elements)
                    ));

                return values.concat($value(`
                        workbooksById['${workbook.id}']
                            .viewsById['${view.id}']
                            .highlight.darken`,
                        darken
                ));
            })
            .catch((e) => {
                console.error({msg: '==== RUH ROH', e, path, index});
                return Observable.throw(e);
            })
        }
    }
}

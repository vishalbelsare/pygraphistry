import { Observable } from 'rxjs/Observable';
import {
    computeSelectionMasks,
    sortAndFilterRowsByQuery,
    loadRowsForSelectionMasks
} from 'viz-app/worker/services/dataframe';

export function filterRows(loadViewsById) {
    return function filterRowsByQuery({
        workbookIds,
        viewIds,
        componentTypes,
        sortKeys,
        sortOrders,
        searchTerms
    }) {
        const queryKeys = [];
        const queryKeysToIds = {
            sortOrder: sortOrders,
            componentType: componentTypes,
            sortKey: sortKeys && sortKeys.map(x => x.slice(7 /*'sortBy:'.length*/)),
            searchTerm: searchTerms && searchTerms.map(x => x.slice(7 /*'search:'.length*/))
        };

        queryKeys.push('componentType');
        sortKeys && queryKeys.push('sortKey');
        sortOrders && queryKeys.push('sortOrder');
        searchTerms && queryKeys.push('searchTerm');

        return loadViewsById({
            workbookIds,
            viewIds
        })
            .mergeMap(
                ({ workbook, view }) => computeSelectionMasks({ view }),
                ({ workbook, view }, selectionMasks) => ({
                    workbook,
                    view,
                    selectionMasks
                })
            )
            .mergeMap(
                ({ workbook, view, selectionMasks }) => componentTypes,
                ({ workbook, view, selectionMasks }, componentType) => ({
                    workbook,
                    view,
                    componentType,
                    selectionMasks
                })
            )
            .let(source =>
                queryKeys.reduce(
                    (source, keyId) =>
                        source.mergeMap(
                            context => queryKeysToIds[keyId],
                            (context, keyValue) => ({
                                ...context,
                                [keyId]: keyValue
                            })
                        ),
                    source
                )
            )
            .mergeMap(mapQueryToFilteredRows, ({ workbook, view, ...query }, { rows = [] }) => ({
                workbook,
                view: {
                    id: view.id,
                    inspector: {
                        rows: queryKeys.reduceRight((node, keyId) => {
                            return {
                                [mapKeyIdToKey(keyId, query)]: node
                            };
                        }, rows)
                    }
                }
            }));

        function mapKeyIdToKey(keyId, query) {
            let key = query[keyId];
            key = (keyId === 'sortKey' && `sortBy:${key}`) || key;
            key = (keyId === 'searchTerm' && `search:${key}`) || key;
            return key;
        }

        function mapQueryToFilteredRows({ view, selectionMasks, ...query }) {
            let inspector = view.inspector || (view.inspector = {});
            let inspectorRows = inspector.rows || (inspector.rows = {});

            return queryKeys.reduce(reduceQueryKeysToFilteredRows, Observable.of(inspectorRows));

            function reduceQueryKeysToFilteredRows(source, keyId, index) {
                return source.mergeMap(node => {
                    let key = mapKeyIdToKey(keyId, query);
                    let curr = node[key];

                    if (index < queryKeys.length - 1 || (curr && curr.tag === selectionMasks.tag)) {
                        return Observable.of(curr || (node[key] = {}));
                    }

                    return sortAndFilterRowsByQuery({
                        view,
                        ...query,
                        rows: loadRowsForSelectionMasks({
                            view,
                            selectionMasks,
                            ...query
                        })
                    }).map(rows => (node[key] = { rows, tag: selectionMasks.tag }));
                });
            }
        }
    };
}

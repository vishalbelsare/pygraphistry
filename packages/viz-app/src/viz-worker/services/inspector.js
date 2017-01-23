import { Observable } from 'rxjs/Observable';
import { cache as Cache, logger as commonLogger } from '@graphistry/common';
import { computeSelectionMasks, computeRowsForSelectionMasks, sortAndFilterRowsByQuery } from 'viz-worker/services/dataframe';

const log = commonLogger.createLogger('viz-worker:services:inspector');

export function loadRows(loadViewsById) {
    return function loadRowsByIndexAndType({
        workbookIds, viewIds, componentTypes
    }) {
        return loadViewsById({
            workbookIds, viewIds
        })
        .mergeMap(
            ({ workbook, view }) => computeSelectionMasks({ view }),
            ({ workbook, view }, selectionMasks) => ({
                workbook, view, selectionMasks
            })
        )
        .mergeMap(
            ({ workbook, view, selectionMasks }) => componentTypes,
            ({ workbook, view, selectionMasks }, componentType) => ({
                workbook, view, componentType, selectionMasks
            })
        )
        .map(({ workbook, view, componentType, selectionMasks }) => {

            let inspector = view.inspector || (view.inspector = {});
            let componentsByType = view.componentsByType || (view.componentsByType = {});
            let componentsByTypeContainer = componentsByType[componentType] || (componentsByType[componentType] = {});
            let { rows } = componentsByTypeContainer;

            if (!rows || componentsByTypeContainer.tag !== selectionMasks.tag) {
                rows = computeRowsForSelectionMasks({ view, componentType, selectionMasks });
                componentsByType[componentType] = { rows, tag: selectionMasks.tag };
            }

            return { workbook, view, rows, componentType, selectionMasks };
        });
    }
}

export function filterRows(loadViewsById) {
    const loadRowsByIndexAndType = loadRows(loadViewsById);
    return function filterRowsByQuery({
        workbookIds, viewIds, componentTypes, sortKeys, sortOrders, searchTerms
    }) {

        const queryKeys = [];
        const queryKeysToIds = {
            sortOrder: sortOrders,
            componentType: componentTypes,
            sortKey: sortKeys && sortKeys.map((x) =>
                x.slice(7 /*'sortBy:'.length*/)),
            searchTerm: searchTerms && searchTerms.map((x) =>
                x.slice(7 /*'search:'.length*/))
        };

        queryKeys.push('componentType');
        sortKeys && queryKeys.push('sortKey');
        sortOrders && queryKeys.push('sortOrder');
        searchTerms && queryKeys.push('searchTerm');

        return loadRowsByIndexAndType({
            workbookIds, viewIds, componentTypes
        })
        .let((source) => queryKeys.reduce(
             (source, keyId) => source.mergeMap(
                 (context) => queryKeysToIds[keyId],
                 (context, keyValue) => ({
                     ...context, [keyId]: keyValue
                 })
             ), source)
        )
        .map(({ workbook, view, rows, selectionMasks, ...query }) => {

            let inspector = view.inspector || (view.inspector = {});

            const { rows: filteredRows } = queryKeys.reduce((node, keyId, index) => {
                let key = mapKeyIdToKey(keyId, query);
                let curr = node[key];
                if (index < queryKeys.length - 1) {
                    return curr || (node[key] = {});
                } else if (!curr || curr.tag !== selectionMasks.tag) {
                    curr = sortAndFilterRowsByQuery({ view, rows, ...query });
                    curr = node[key] = { rows: curr, tag: selectionMasks.tag };
                }
                return curr;
            }, inspector.rows || (inspector.rows = {}));

            return {
                workbook, view: {
                    id: view.id, inspector: {
                        rows: queryKeys.reduceRight((node, keyId) => {
                            return {
                                [mapKeyIdToKey(keyId, query)]: node
                            };
                        }, filteredRows)
                    }
                }
            };
        });

        function mapKeyIdToKey(keyId, query) {
            let key = query[keyId];
            key = keyId === 'sortKey' && `sortBy:${key}` || key;
            key = keyId === 'searchTerm' && `search:${key}` || key;
            return key;
        }
    }
}

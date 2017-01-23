import { Observable } from 'rxjs/Observable';
import { logger as commonLogger } from '@graphistry/common';
import DataframeMask from 'viz-worker/simulator/DataframeMask';
import { columns as createColumns } from 'viz-shared/models/columns';
import ExpressionCodeGenerator from 'viz-worker/simulator/expressionCodeGenerator';
const logger = commonLogger.createLogger('viz-worker/services/dataframe.js');

export function appendColumn({ view, componentType, name, values, dataType }) {
    const { nBody } = view;
    const { dataframe } = nBody;
    view.componentsByType = undefined;
    view.inspector.rows = undefined;
    return (view.columns = createColumns(dataframe
        .addClientProvidedColumn(componentType, name, values, dataType)
        .getColumnsByType(true)
    ));
}

export function tickLayout({ view }) {
    const { nBody } = view;
    nBody.interactions.next({
        play: true, layout: true
    });
    return Observable.empty();
}

export function maskDataframe({ view }) {

    const { nBody } = view;
    const { expressionsById } = view;
    const { dataframe, simulator } = nBody;

    const { selectionMasks, exclusionMasks, limits, errors } =
        groupExpressionsByTypeWithLimitsAndErrors({ dataframe, expressionsById });

    const applyMasksAndEmitUpdatedBuffers = Observable.defer(() => {

        // Prune out dangling edges.
        const prunedMasks = dataframe
            .pruneMaskEdges(dataframe
                .composeMasks(selectionMasks, exclusionMasks, limits));

        const updatedBuffersFromApplyingPrunedMasks = dataframe
            .applyDataframeMaskToFilterInPlace(prunedMasks, simulator);

        if (!view.pruneOrphans) {
            return updatedBuffersFromApplyingPrunedMasks;
        }

        return Observable
            .from(updatedBuffersFromApplyingPrunedMasks)
            .mergeMap(
                (updatedBuffers) => {
                    const orphanPrunedMasks = dataframe.pruneOrphans(prunedMasks);
                    const updatedBuffersFromApplyingOrphanPrunedMasks = dataframe
                        .applyDataframeMaskToFilterInPlace(orphanPrunedMasks, simulator);
                    return updatedBuffersFromApplyingOrphanPrunedMasks;
                },
                (updatedBuffers, pruneUpdatedBuffers) => {
                    // We check return value to see if we should update buffers on the client.
                    // Because this is a cascade of 2 filters, we need to return whether either of them should update
                    return pruneUpdatedBuffers || updatedBuffers;
                }
            );
    });

    return applyMasksAndEmitUpdatedBuffers
        .mergeMap(updateLayoutDataframeBuffers)
        .do(tickSimulatorAndNotifyVBOLoop)
        .mergeMap((updatedBuffers) => {
            if (errors && errors.length > 0) {
                return Observable.throw(errors);
            }
            return Observable.of({ view });
        });

    function updateLayoutDataframeBuffers(updatedBuffers) {
        if (updatedBuffers !== false) {
            logger.trace('Updating layoutAlgorithms after dataframe mask');
            const { layoutAlgorithms } = simulator;
            return Observable.merge(
                ...layoutAlgorithms.map((algo) =>
                    Observable.from(algo.updateDataframeBuffers(simulator))
                )
            )
            .toArray()
            .mapTo(updatedBuffers);
        }
        return Observable.of(updatedBuffers);
    }

    function tickSimulatorAndNotifyVBOLoop(updatedBuffers) {
        if (updatedBuffers !== false) {
            logger.trace('ticking simulator buffers after dataframe mask');
            simulator.tickBuffers([
                'curPoints', 'pointSizes', 'pointColors',
                'edgeColors', 'logicalEdges', 'springsPos'
            ]);
            const { server } = nBody;
            if (server) {
                // we don't have to do this -- nice
                // if (server.viewConfig) {
                //     server.viewConfig.next(view);
                // }
                if (server.ticksMulti) {
                    logger.trace('updating ticksMulti Subject');
                    server.ticksMulti.next(nBody);
                }
            }
        } else {
            logger.trace('no buffers to update after dataframe mask');
        }
    }
}

export function computeSelectionMasks({ view, emptyIfAllSelected = false }) {

    const { nBody = {} } = view;
    const { dataframe = {}, simulator } = nBody;
    const { selection: { mask: rect } = {} } = view;
    const hasSelectionRect = rect && rect.tl && rect.br;

    if (emptyIfAllSelected && !hasSelectionRect) {
        return Observable.of(
            createTaggedSelectionMasks(dataframe, simulator, [])
        );
    } else if (dataframe.lastTaggedSelectionMasks) {
        return Observable.of(dataframe.lastTaggedSelectionMasks);
    } else {
        return Observable
            .defer(() => simulator.selectNodesInRect(rect || { all: true }))
            .map((pointsMask) =>
                dataframe.lastTaggedSelectionMasks =
                    createTaggedSelectionMasks(dataframe, simulator, pointsMask)
            );
    }
}

export function computeRowsForSelectionMasks({ view, columnNames, componentType, selectionMasks }) {

    const { nBody: { dataframe, vgraphLoaded } } = view;

    if (!dataframe || !vgraphLoaded) {
        return [];
    }

    const indexes = selectionMasks.getMaskForType(componentType);

    if (indexes.length <= 0) {
        return [];
    }

    columnNames = columnNames || dataframe.publicColumnNamesByType(componentType);

    return dataframe.getRows(indexes, componentType, columnNames, false);
}

export function sortAndFilterRowsByQuery({ view, rows, columnNames, ...query }) {

    const { nBody: { dataframe, vgraphLoaded } } = view;

    if (!dataframe || !vgraphLoaded) {
        return rows || [];
    }

    const { sortColumn = query.sortKey } = query;
    const { componentType = query.openTab } = query;

    let itr, itr2, count, filteredRows,
        searchTerm = (query.searchTerm || '').toLowerCase();

    columnNames = columnNames || dataframe.publicColumnNamesByType(componentType);

    const { length: columnsLength = 0 } = columnNames;

    if (searchTerm && columnsLength) {

        itr2 = -1;
        count = 0;
        filteredRows = [];

        const rowsLength = rows.length;

        while (++itr2 < rowsLength) {
            itr = -1;
            while (++itr < columnsLength) {
                let row = rows[itr2];
                let columnName = columnNames[itr];
                let cellValue = row[columnName];
                if (cellValue == null) continue;
                if ((cellValue = ('' + cellValue).toLowerCase()) === '') continue;
                if (~cellValue.indexOf(searchTerm)) {
                    filteredRows[count++] = row;
                    break;
                }
            }
        }
    } else {
        filteredRows = rows.slice(0);
    }

    if (sortColumn) {

        // TODO: Speed this up / cache sorting. Actually, put this into dataframe itself.
        // Only using permutation out here because this should be pushed into dataframe.
        const { ascending = query.sortOrder === 'asc' } = query;

        filteredRows = filteredRows.sort((row1, row2) => {
            const a = row1[sortColumn];
            const b = row2[sortColumn];
            if (typeof a === 'string' && typeof b === 'string') {
                return (ascending ? a.localeCompare(b) : b.localeCompare(a));
            } else if (isNaN(a) || a < b) {
                return ascending ? -1 : 1;
            } else if (isNaN(b) || a > b) {
                return ascending ? 1 : -1;
            } else {
                return 0;
            }
        });
    }

    return filteredRows;
}

let selectionMasksTag = 0;
function createTaggedSelectionMasks(dataframe, simulator, pointsMask) {
    const mask = new DataframeMask(
        dataframe, pointsMask, pointsMask === undefined ?
            undefined : simulator.connectedEdges(pointsMask)
    );
    mask.tag = ++selectionMasksTag;
    return mask;
}

function groupExpressionsByTypeWithLimitsAndErrors({ dataframe, expressionsById }) {

    const limits = { edge: Infinity, point: Infinity };
    const selectionMasks = [], exclusionMasks = [], errors = [];
    const codeGenerator = new ExpressionCodeGenerator('javascript');

    for (const expressionId in expressionsById) {

        const expression = expressionsById[expressionId];

        if (!expression || !expressionsById.hasOwnProperty(expressionId)) {
            continue;
        }

        const { query, enabled } = expression;

        if (query === undefined || !enabled) {
            continue;
        }

        const { identifier, componentType, expressionType } = expression;

        if (expressionType === 'filter') {

            const { ast } = query;

            if (ast && ast.value !== undefined &&
                ast.type === 'LimitExpression') {
                limits.edge =
                limits.point = codeGenerator.evaluateExpressionFree(ast.value);
                continue;
            }
        }

        const expressionQuery = {
            ...query,
            type: componentType,
            attribute: identifier
        };

        const masks = dataframe.getMasksForQuery(expressionQuery, errors);

        if (masks !== undefined) {
            masks.setExclusive(expressionType === 'exclusion');
            // Record the size of the filtered set for UI feedback:
            expression.maskSizes = masks.maskSize();
            (expressionType === 'filter' ?
                selectionMasks : exclusionMasks
            ).push(masks);
        }
    }

    return { selectionMasks, exclusionMasks, limits, errors };
}

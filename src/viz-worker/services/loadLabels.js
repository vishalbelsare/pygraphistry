import palettes from '../simulator/palettes';
import dataTypeUtil from '../simulator/dataTypes';

import { loadViews } from './loadViews';
import { cache as Cache } from '@graphistry/common';
import { Observable, ReplaySubject } from '@graphistry/rxjs';
import { ref as $ref, atom as $atom } from 'falcor-json-graph';

export function loadLabels(workbooksById, nBodiesById, config, s3Cache = new Cache(config.LOCAL_CACHE_DIR, config.LOCAL_CACHE)) {

    const loadViewsById = loadViews(workbooksById, nBodiesById, config, s3Cache);

    return function loadLabelsByIndexAndType({ workbookIds, viewIds, labelTypes, labelIndexes, options = {} }) {
        return loadViewsById({
            workbookIds, viewIds, options
        })
        .mergeMap(
            ({ workbook, view }) => labelTypes,
            ({ workbook, view }, labelType) => ({
                workbook, view, labelType
            })
        )
        .mergeMap(({ workbook, view, labelType }) => getLabelsForType(
            workbook, view, labelType, labelIndexes
        ));
    }
}

function getLabelsForType(workbook, view, labelType, labelIndexes) {

    const { nBody } = view;

    if (!nBody || !nBody.simulator || !nBody.simulator.dataframe) {
        return [$atom()];
    }

    const { dataframe } = nBody.simulator;
    const labelBufferName = `${labelType}Labels`;
    const hasPrecomputedLabels = dataframe.hasHostBuffer(labelBufferName);

    if (hasPrecomputedLabels) {
        return labelIndexes.map((labelIndex) => ({
            workbook, view, label: {
                type: labelType, index: labelIndex, data: {
                    formatted: dataframe.getCell(labelIndex, 'hostBuffer', labelBufferName)
                }
            }
        }));
    }

    const titleColumnName = '_title';
    const columnNames = dataframe.publicColumnNamesByType(labelType) || [];
    const rows = dataframe.getRows(labelIndexes, labelType, columnNames);

    const { dataTypesByColumnName, colorMappedByColumnName } = columnNames
        .reduce((memo, columnName) => {

            const { dataTypesByColumnName, colorMappedByColumnName } = memo;

            dataTypesByColumnName[columnName] = dataframe.getDataType(columnName, labelType);

            if (dataframe.doesColumnRepresentColorPaletteMap(labelType, columnName)) {
                colorMappedByColumnName[columnName] = true;
            }

            return memo;
        }, {
            dataTypesByColumnName: {},
            colorMappedByColumnName: {}
        });

    return rows.map((row, labelIndex) => {

        const title = row[titleColumnName];
        const names = columnNames.length && columnNames || Object.keys(row);
        const columns = names.reduce((columns, columnName) => {

            const value = row[columnName];

            if (columnName !== titleColumnName && !(
                dataTypeUtil.valueSignifiesUndefined(value))) {

                const key = columnName;
                const dataType = dataTypesByColumnName[columnName];
                const displayName = colorMappedByColumnName.hasOwnProperty(columnName) ?
                    palettes.intToHex(palettes.bindings[value]) :
                    undefined;

                columns.push({ key, value, displayName, dataType });
            }

            return columns;
        }, []);

        return {
            workbook, view, label: {
                type: labelType, index: labelIndex, data: {
                    title, columns
                }
            }
        };
    });
}

import sanitizeHTML from 'sanitize-html';
import DataframeMask from 'viz-app/worker/simulator/DataframeMask';
import { valueSignifiesUndefined } from 'viz-app/worker/simulator/dataTypes';
import { intToHex, bindings as paletteBindings } from 'viz-app/worker/simulator/palettes';

import { Observable, ReplaySubject } from 'rxjs';
import { cache as Cache } from '@graphistry/common';
import { $ref, $atom } from '@graphistry/falcor-json-graph';

export function loadLabels(loadViewsById) {
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
                    formatted: dataframe
                        .getCell(labelIndex, 'hostBuffer', labelBufferName)
                }
            }
        }));
    }

    const titleColumnName = '_title';
    const indexColumnName = '_index';
    const columnNames = dataframe.publicColumnNamesByType(labelType);

    // Unbase mask from local filtered coordinate system to global coordinate system
    const unbasedMasks = new DataframeMask(
        dataframe,
        labelType === 'point' ? labelIndexes : undefined,
        labelType === 'edge' ? labelIndexes : undefined,
        dataframe.lastMasks
    );

    const rows = unbasedMasks.mapIndexesByType(labelType, (index) => {
        return dataframe.getRowAt(index, labelType, columnNames, true);
    });

    const { dataTypesByColumnName, colorMappedByColumnName } = (columnNames || [])
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

    return rows.map((row, index) => {

        let title = row[titleColumnName];

        if (typeof title === 'string') {
            title = decodeAndSanitize('' + title);
        }

        const names = columnNames.length && columnNames || Object.keys(row);
        const columns = names.reduce((columns, columnName) => {

            let value = row[columnName];

            if (columnName === titleColumnName ||
                columnName === indexColumnName ||
                valueSignifiesUndefined(value)) {
                return columns;
            }

            const key = columnName;
            const dataType = dataTypesByColumnName[columnName];
            const displayName = colorMappedByColumnName.hasOwnProperty(columnName) ?
                intToHex(paletteBindings[value]) :
                undefined;

            if (dataType === 'string') {
                value = decodeAndSanitize('' + value);
            }

            columns.push({ key, value, displayName, dataType });

            return columns;
        }, [])
        .sort((a, b) => (
              a.key.toLowerCase() < b.key.toLowerCase() ? -1
            : a.key.toLowerCase() > b.key.toLowerCase() ? 1
            : 0
        ));

        return {
            workbook, view, label: {
                type: labelType,
                index: labelIndexes[index],
                data: {
                    title, columns,
                    globalIndex: row._index
                },
            }
        };
    });
}

function decodeAndSanitize(input) {
    let decoded = input, value = input;
    try { decoded = decodeURIComponent(input); }
    catch (e) { decoded = input; }
    try { value = sanitizeHTML(decoded); }
    catch (e) { value = decoded; }
    return value;
}

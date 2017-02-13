import sanitizeHTML from 'sanitize-html';
import palettes from 'viz-worker/simulator/palettes';
import dataTypeUtil from 'viz-worker/simulator/dataTypes';

import { cache as Cache } from '@graphistry/common';
import { Observable, ReplaySubject } from 'rxjs';
import { ref as $ref, atom as $atom } from '@graphistry/falcor-json-graph';

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
    const columnNames = dataframe.publicColumnNamesByType(labelType);
    const rows = dataframe.getRows(labelIndexes, labelType, columnNames);

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

            if (columnName !== titleColumnName && !(
                dataTypeUtil.valueSignifiesUndefined(value))) {

                const key = columnName;
                const dataType = dataTypesByColumnName[columnName];
                const displayName = colorMappedByColumnName.hasOwnProperty(columnName) ?
                    palettes.intToHex(palettes.bindings[value]) :
                    undefined;

                if (dataType === 'string') {
                    value = decodeAndSanitize('' + value);
                }

                columns.push({ key, value, displayName, dataType });
            }

            return columns;
        }, [])
        .sort((a, b) => (
              a.key.toLowerCase() < b.key.toLowerCase() ? -1
            : a.key.toLowerCase() > b.key.toLowerCase() ? 1
            : 0
        ));

        return {
            workbook, view, label: {
                type: labelType, index: labelIndexes[index], data: {
                    title, columns
                }
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

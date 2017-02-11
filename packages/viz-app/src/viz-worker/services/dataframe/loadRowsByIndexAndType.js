import sanitizeHTML from 'sanitize-html';
import { Observable } from 'rxjs/Observable';
import palettes from 'viz-worker/simulator/palettes';
import dataTypeUtil from 'viz-worker/simulator/dataTypes';

export function loadRows(loadViewsById) {
    return function loadRowsByIndexAndType({
        workbookIds, viewIds, rowIndexes, columnNames, componentTypes, options = {}
    }) {
        return loadViewsById({
            workbookIds, viewIds, options
        })
        .mergeMap(
            ({ workbook, view }) => componentTypes,
            ({ workbook, view }, componentType) => ({
                workbook, view, componentType
            })
        )
        .mergeMap(
            ({ workbook, view, componentType }) => getRowsForType({
                workbook, view, columnNames, rowIndexes, componentType
            }),
            ({ workbook, view, componentType }, row) => ({
                workbook, view, componentType, row
            })
        );
    }
}

export function getDataTypesAndColorColumns(dataframe, columnNames, componentType) {
    return columnNames.reduce((memo, columnName) => {

        const { dataTypesByColumnName, colorMappedByColumnName } = memo;

        dataTypesByColumnName[columnName] = dataframe.getDataType(columnName, componentType);

        if (dataframe.doesColumnRepresentColorPaletteMap(componentType, columnName)) {
            colorMappedByColumnName[columnName] = true;
        }

        return memo;
    },
    { dataTypesByColumnName: {}, colorMappedByColumnName: {} });
}

function getRowsForType({ workbook, view, columnNames, rowIndexes, componentType }) {

    const { nBody: { dataframe, vgraphLoaded } } = view;

    if (!dataframe || !vgraphLoaded) {
        return [];
    }

    if (componentType === 'event') {
        componentType = 'point';
    }

    columnNames = (columnNames || dataframe.getAttributeKeys(componentType)).map((columnName) => ({
        columnName, key: dataframe.getAttributeKeyForColumnName(columnName, componentType)
    }));

    const keys = columnNames.map(({ key }) => key);
    const rows = dataframe.getRows(rowIndexes, componentType, keys);

    const { dataTypesByColumnName, colorMappedByColumnName } =
        getDataTypesAndColorColumns(dataframe, keys, componentType);

    return rows.map((row) => {
        const names = columnNames.length && columnNames || Object.keys(row);
        return names.reduce((row, { key, columnName }) => {
            let value = row[key];
            const dataType = dataTypesByColumnName[key];
            if (dataTypeUtil.valueSignifiesUndefined(value) === false) {
                if (colorMappedByColumnName.hasOwnProperty(key)) {
                    row[columnName] = palettes.intToHex(palettes.bindings[value]);
                } else if (dataType === 'color') {
                    row[columnName] = palettes.intToHex(value);
                } else if (dataType === 'string') {
                    // If the data type is a string, decode and sanitize in case it's HTML
                    row[columnName] = sanitizeHTML(decodeURIComponent(value));
                }
            }
            return row;
        }, row);
    });
}

import sanitizeHTML from 'sanitize-html';
import { Observable } from 'rxjs/Observable';
import { valueSignifiesUndefined } from 'viz-app/worker/simulator/dataTypes';
import { intToHex, bindings as paletteBindings } from 'viz-app/worker/simulator/palettes';

export function loadRows(loadViewsById) {
  return function loadRowsByIndexAndType({
    workbookIds,
    viewIds,
    rowIndexes,
    columnNames,
    componentTypes,
    options = {}
  }) {
    return loadViewsById({
      workbookIds,
      viewIds,
      options
    })
      .mergeMap(
        ({ workbook, view }) => componentTypes,
        ({ workbook, view }, componentType) => ({
          workbook,
          view,
          componentType
        })
      )
      .mergeMap(
        ({ workbook, view, componentType }) =>
          getRowsForType({
            workbook,
            view,
            columnNames,
            rowIndexes,
            componentType
          }),
        ({ workbook, view, componentType }, row) => ({
          workbook,
          view,
          componentType,
          row
        })
      );
  };
}

export function getDataTypesAndColorColumns(dataframe, columnNames, componentType) {
  return columnNames.reduce(
    (memo, columnName) => {
      const { dataTypesByColumnName, colorMappedByColumnName } = memo;

      dataTypesByColumnName[columnName] = dataframe.getDataType(columnName, componentType);

      if (dataframe.doesColumnRepresentColorPaletteMap(componentType, columnName)) {
        colorMappedByColumnName[columnName] = true;
      }

      return memo;
    },
    { dataTypesByColumnName: {}, colorMappedByColumnName: {} }
  );
}

function getRowsForType({ workbook, view, columnNames, rowIndexes, componentType }) {
  const { nBody: { dataframe, vgraphLoaded } } = view;

  if (!dataframe || !vgraphLoaded) {
    return [];
  }

  if (componentType === 'event') {
    componentType = 'point';
  }

  columnNames = (columnNames || dataframe.getAttributeKeys(componentType)).map(columnName => ({
    columnName,
    key: dataframe.getAttributeKeyForColumnName(columnName, componentType) || columnName
  }));

  const keys = columnNames.map(({ key }) => key).filter(key => key !== '_index');

  const rows = dataframe.getRows(rowIndexes, componentType, keys);

  const { dataTypesByColumnName, colorMappedByColumnName } = getDataTypesAndColorColumns(
    dataframe,
    keys,
    componentType
  );

  return rows.map(row => {
    const names = (columnNames.length && columnNames) || Object.keys(row);
    return names.reduce((row, { key, columnName }) => {
      let value = row[key];
      const dataType = dataTypesByColumnName[key];
      if (valueSignifiesUndefined(value) === false) {
        if (colorMappedByColumnName.hasOwnProperty(key)) {
          row[columnName] = intToHex(paletteBindings[value]);
        } else if (dataType === 'color') {
          row[columnName] = intToHex(value);
        } else if (dataType === 'string') {
          // If the data type is a string, decode and sanitize in case it's HTML
          row[columnName] = decodeAndSanitize(value);
        }
      }
      return row;
    }, row);
  });
}

function decodeAndSanitize(input) {
  let decoded = input,
    value = input;
  try {
    decoded = decodeURIComponent(input);
  } catch (e) {
    decoded = input;
  }
  try {
    value = sanitizeHTML(decoded);
  } catch (e) {
    value = decoded;
  }
  return value;
}

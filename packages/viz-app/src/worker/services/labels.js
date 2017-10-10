import sanitizeHTML from 'sanitize-html';
import DataframeMask from 'viz-app/worker/simulator/DataframeMask';
import { valueSignifiesUndefined } from 'viz-app/worker/simulator/dataTypes';
import { intToHex, bindings as paletteBindings } from 'viz-app/worker/simulator/palettes';

import { Observable, ReplaySubject } from 'rxjs';
import { cache as Cache } from '@graphistry/common';
import { $ref, $atom } from '@graphistry/falcor-json-graph';

export function loadLabels(loadViewsById) {
  return function loadLabelsByIndexAndType({
    workbookIds,
    viewIds,
    labelTypes,
    labelIndexes,
    options = {}
  }) {
    return loadViewsById({
      workbookIds,
      viewIds,
      options
    })
      .mergeMap(
        ({ workbook, view }) => labelTypes,
        ({ workbook, view }, labelType) => ({
          workbook,
          view,
          labelType
        })
      )
      .mergeMap(({ workbook, view, labelType }) =>
        getLabelsForType(workbook, view, labelType, labelIndexes)
      );
  };
}

function getLabelsForType(workbook, view, labelType, labelIndexes) {
  const { nBody } = view;

  if (!nBody || !nBody.simulator || !nBody.simulator.dataframe) {
    return [$atom()];
  }

  const { dataframe } = nBody.simulator;
  const labelBufferName = `${labelType}Labels`;
  const hasPrecomputedLabels = dataframe.hasHostBuffer(labelBufferName);

  // Unbase mask from local filtered coordinate system to global coordinate system
  const unbasedMasks = new DataframeMask(
    dataframe,
    labelType === 'point' ? labelIndexes : undefined,
    labelType === 'edge' ? labelIndexes : undefined,
    dataframe.lastMasks
  );

  if (hasPrecomputedLabels) {
    return unbasedMasks.mapIndexesByType(labelType, (globalIndex, index) => ({
      workbook,
      view,
      label: {
        type: labelType,
        index: labelIndexes[index],
        data: {
          columns: [],
          globalIndex,
          title: dataframe.getCell(globalIndex, 'hostBuffer', labelBufferName, true)
        }
      }
    }));
  }

  const titleColumnName = '_title';
  const indexColumnName = '_index';
  const columnNames = dataframe.publicColumnNamesByType(labelType);

  const rows = unbasedMasks.mapIndexesByType(labelType, index => {
    return dataframe.getRowAt(index, labelType, columnNames, true);
  });

  const { dataTypesByColumnName, colorMappedByColumnName } = (columnNames || []).reduce(
    (memo, columnName) => {
      const { dataTypesByColumnName, colorMappedByColumnName } = memo;

      dataTypesByColumnName[columnName] = dataframe.getDataType(columnName, labelType);

      if (dataframe.doesColumnRepresentColorPaletteMap(labelType, columnName)) {
        colorMappedByColumnName[columnName] = true;
      }

      return memo;
    },
    {
      dataTypesByColumnName: {},
      colorMappedByColumnName: {}
    }
  );

  return rows.map((row, index) => {
    let title = row[titleColumnName];

    if (typeof title === 'string') {
      title = decodeAndSanitize('' + title);
    }

    const names = (columnNames.length && columnNames) || Object.keys(row);
    const columns = names
      .reduce((columns, columnName) => {
        let value = row[columnName];

        if (
          columnName === titleColumnName ||
          columnName === indexColumnName ||
          valueSignifiesUndefined(value)
        ) {
          return columns;
        }

        const key = columnName;
        const dataType = dataTypesByColumnName[columnName];
        const displayName = colorMappedByColumnName.hasOwnProperty(columnName)
          ? intToHex(paletteBindings[value])
          : undefined;

        if (dataType === 'string') {
          value = decodeAndSanitize('' + value);
        }

        columns.push({ key, value, displayName, dataType });

        return columns;
      }, [])
      .sort(
        (a, b) =>
          a.key.toLowerCase() < b.key.toLowerCase()
            ? -1
            : a.key.toLowerCase() > b.key.toLowerCase() ? 1 : 0
      );

    const importantColumns = !canHaveImportantKeys(columns)
      ? []
      : columns
          .map(kv => {
            const topKeyIndex = mostImportantKeys.indexOf(kv.key);
            return topKeyIndex > -1 ? { topKeyIndex, ...kv } : null;
          })
          .filter(kv => kv)
          .sort(({ topKeyIndex: k1 }, { topKeyIndex: k2 }) => k1 - k2);

    return {
      workbook,
      view,
      label: {
        type: labelType,
        index: labelIndexes[index],
        data: {
          title,
          columns,
          importantColumns,
          globalIndex: row._index
        }
      }
    };
  });
}

const mostImportantKeys = [
  'Source',
  'Destination',

  'time',
  'Pivot',

  'src',
  'src_hostname',
  'src_ip',
  'src_mac',
  'src_port',
  'src_user',
  'dest',
  'dest_hostname',
  'dest_ip',
  'dest_location',
  'dest_mac',
  'dest_port',
  'dest_user',
  'user',

  'type',
  'edgeType',
  'cols',
  'vendor',
  'product',
  'externalId',

  'msg',
  'fname',
  'filename',
  'fileHash',
  'filePath',
  'link',
  'url'
];

function canHaveImportantKeys(columns) {
  return columns.some(
    ({ key, value }) =>
      (key === 'type' && value === 'EventID') || (key === 'edgeType' && value.match(/^EventID->/))
  );
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

import { sort as TimSort } from 'timsort';
import { Observable } from 'rxjs/Observable';
import * as Scheduler from 'rxjs/scheduler/async';
import { defaultFormat } from 'viz-app/formatters';
import { comparatorForDataType } from 'viz-app/worker/simulator/dataTypes';
import { getDataTypesAndColorColumns } from './loadRowsByIndexAndType';
import { intToHex, bindings as paletteBindings } from 'viz-app/worker/simulator/palettes';

export function sortAndFilterRowsByQuery({ view, rows, columnNames, ...query }) {
  const { nBody: { dataframe, vgraphLoaded } } = view;

  if (!dataframe || !vgraphLoaded) {
    return Observable.of(rows || []);
  }

  let filterForRowsWithEventIDs = false;
  let { sortColumn = query.sortKey } = query;
  let { searchTerm = '', componentType = query.openTab } = query;

  if (componentType === 'event') {
    componentType = 'point';
    filterForRowsWithEventIDs = true;
  }

  columnNames = (columnNames || dataframe.getAttributeKeys(componentType)).map(columnName => ({
    columnName,
    key: dataframe.getAttributeKeyForColumnName(columnName, componentType) || columnName
  }));

  if (!columnNames || columnNames.length <= 0) {
    return Observable.of([]);
  }

  const keys = columnNames.map(({ key }) => key).filter(key => key !== '_index');

  let filteredRows,
    sortColumnDataType,
    rowsPerRange = 10000;

  const { dataTypesByColumnName, colorMappedByColumnName } = getDataTypesAndColorColumns(
    dataframe,
    keys,
    componentType
  );

  if (!searchTerm && !filterForRowsWithEventIDs) {
    filteredRows = Observable.of(rows.slice(0));
  } else {
    const filterRowsPredicate = filterRowsBySearchTerm(
      keys,
      ('' + searchTerm).toLowerCase(),
      dataTypesByColumnName,
      colorMappedByColumnName,
      filterForRowsWithEventIDs ? includeRowsWithTypeColumnAndTypeIsEventID : null
    );

    filteredRows = listToItemRanges(rows, rowsPerRange)
      .map(rowRange => rowRange.filter(filterRowsPredicate).subscribeOn(Scheduler.async))
      .concatAll()
      .toArray();
  }

  if (sortColumn) {
    sortColumnDataType =
      dataTypesByColumnName[
        (sortColumn = dataframe.getAttributeKeyForColumnName(sortColumn, componentType))
      ];

    // TODO: Speed this up / cache sorting. Actually, put this into dataframe itself.
    // Only using permutation out here because this should be pushed into dataframe.

    const sortColumnIsPalletteColor = colorMappedByColumnName.hasOwnProperty(sortColumn);
    const sortColumnIsColor = sortColumnDataType === 'color' || sortColumnIsPalletteColor;

    if (sortColumnIsColor) {
      sortColumnDataType = 'string';
    }

    const { ascending = query.sortOrder === 'asc' } = query;
    const compareRows = compareRowsByColumnName(
      sortColumn,
      ascending ? 1 : -1,
      comparatorForDataType(sortColumnDataType)
    );

    const aggregateRows = (rows, range) => rows.concat(range);
    const runTimSortOnRows = rows => TimSort(rows, compareRows) || rows;
    const mapColorColumnToString = source => {
      if (!sortColumnIsColor) {
        return source;
      } else if (!sortColumnIsPalletteColor) {
        return source.do(row => {
          const val = row[sortColumn];
          if (typeof val === 'number') {
            row[sortColumn] = intToHex(val);
          }
        });
      }
      return source.do(row => {
        const val = row[sortColumn];
        if (typeof val === 'number') {
          row[sortColumn] = intToHex(paletteBindings[val]);
        }
      });
    };

    const sortEachRowRange = range => {
      return range
        .let(mapColorColumnToString)
        .toArray()
        .map(runTimSortOnRows)
        .delay(0)
        .subscribeOn(Scheduler.async);
    };

    filteredRows = filteredRows
      .mergeMap(rows => listToItemRanges(rows, rowsPerRange))
      .concatMap(sortEachRowRange)
      .reduce(aggregateRows, [])
      .map(runTimSortOnRows);
  }

  return filteredRows;
}

function listToItemRanges(list, itemsPerRange) {
  return Observable.from({
    length: Math.ceil(list.length / itemsPerRange)
  }).map((x, rangeIndex) => {
    const rangeStart = rangeIndex * itemsPerRange;
    const rangeCount = Math.min(itemsPerRange, list.length - rangeStart);
    return Observable.range(rangeStart, rangeCount).map(itemIndex => list[itemIndex]);
  });
}

function compareRowsByColumnName(columnName, ascending, comparator) {
  return function compareRows(rowA, rowB) {
    return !comparator ? 0 : ascending * comparator(rowA[columnName], rowB[columnName]);
  };
}

function includeRowsWithTypeColumnAndTypeIsEventID(row) {
  if (row && row['type'] === 'EventID') {
    return true;
  }
  return false;
}

function filterRowsBySearchTerm(columnNames, searchTerm, dataTypes, colorColumns, eventPredicate) {
  const columnsLength = columnNames.length;
  return function filterRow(row) {
    if (eventPredicate && eventPredicate(row) === false) {
      return false;
    }
    let itr = -1;
    while (++itr < columnsLength) {
      const columnName = columnNames[itr];
      const dataType = dataTypes[columnName];
      let value = row[columnName];
      if (value == null || value === '') {
        continue;
      } else if (colorColumns.hasOwnProperty(columnName)) {
        value = intToHex(paletteBindings[value]);
      } else if (dataType === 'color') {
        value = intToHex(value);
      } else if (dataType !== 'string') {
        value = ('' + value).toLowerCase();
      } else {
        value = tryDecode(value).toLowerCase();
      }
      if (~value.indexOf(searchTerm)) {
        return true;
      }
    }
    return false;
  };
}

function tryDecode(input) {
  let value = input;
  try {
    value = decodeURIComponent(input);
  } catch (e) {
    value = input;
  }
  return value;
}

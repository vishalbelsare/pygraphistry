import { Observable } from 'rxjs/Observable';
import { getHandler, setHandler } from 'viz-app/router';
import { $ref, $value, $invalidate } from '@graphistry/falcor-json-graph';

export function inspector(path, base) {
  return function inspector({ loadViewsById, filterRowsByQuery, loadRowsByIndexAndType }) {
    const getValues = getHandler(path, loadViewsById);
    const setValues = setHandler(path, loadViewsById);

    return [
      {
        returns: `*`,
        get: getValues,
        set: setValues,
        route: `${base}['inspector']['open', 'openTab', 'length', 'id', 'name', 'templates', 'currentQuery']`
      },
      {
        get: getValues,
        route: `${base}['inspector'].tabs[{keys}]`
      },
      {
        get: getValues,
        route: `${base}['inspector'].controls[{keys}]`
      },
      {
        returns: `*`,
        get: getValues,
        set: setValues,
        route: `${base}['inspector'].queries[{keys}][{keys}]`
      },
      {
        get: getValues,
        set: setValues,
        route: `${base}['inspector'].controls[{keys}][{keys}]`
      },
      {
        call: filterRowsByColumnAndValue,
        route: `${base}['componentsByType'][{keys: componentTypes}].rows.filter`
      },
      {
        get: getRowsByTypeAndIndex,
        route: `${base}['componentsByType'][{keys: componentTypes}].rows[{integers: rowIndexes}][{keys: columnNames}]`
      },
      {
        get: getRowLengthOrValueRefsByQuery,
        route: `${base}['inspector'].rows[{keys: componentTypes}].length`
      },
      {
        get: getRowLengthOrValueRefsByQuery,
        route: `${base}['inspector'].rows[{keys: componentTypes}][{integers}]`
      },
      {
        get: getRowLengthOrValueRefsByQuery,
        route: `${base}['inspector'].rows[{keys: componentTypes}][{keys: sortKeys}].length`
      },
      {
        get: getRowLengthOrValueRefsByQuery,
        route: `${base}['inspector'].rows[{keys: componentTypes}][{keys: sortKeys}][{integers}]`
      },
      {
        get: getRowLengthOrValueRefsByQuery,
        route: `${base}['inspector'].rows[{keys: componentTypes}][{keys: sortKeys}][{keys: sortOrders}].length`
      },
      {
        get: getRowLengthOrValueRefsByQuery,
        route: `${base}['inspector'].rows[{keys: componentTypes}][{keys: sortKeys}][{keys: sortOrders}][{integers}]`
      },
      {
        get: getRowLengthOrValueRefsByQuery,
        route: `${base}['inspector'].rows[{keys: componentTypes}][{keys: sortKeys}][{keys: sortOrders}][{keys: searchTerms}].length`
      },
      {
        get: getRowLengthOrValueRefsByQuery,
        route: `${base}['inspector'].rows[{keys: componentTypes}][{keys: sortKeys}][{keys: sortOrders}][{keys: searchTerms}][{integers}]`
      }
    ];

    function getRowLengthOrValueRefsByQuery(rowsPath) {
      const { sortKeys, sortOrders, searchTerms, componentTypes } = rowsPath;
      const getRowValuesHandler = getHandler(path, context =>
        filterRowsByQuery({
          ...context,
          componentTypes,
          searchTerms,
          sortKeys,
          sortOrders
        })
      );

      return getRowValuesHandler.call(this, rowsPath).map(({ path, value }) => {
        if (path[path.length - 1] !== 'length' && value) {
          const rowsKeyIndex = path.indexOf('rows');
          const componentType = path[rowsKeyIndex + 1];
          const basePath = path.slice(0, rowsKeyIndex - 1);
          value = $ref(basePath.concat('componentsByType', componentType, 'rows', value._index));
        }
        return { path, value };
      });
    }

    function getRowsByTypeAndIndex(path) {
      const workbookIds = [].concat(path[1]);
      const viewIds = [].concat(path[3]);

      const { componentTypes = [], rowIndexes = [], columnNames = [] } = path;

      return loadRowsByIndexAndType({
        workbookIds,
        viewIds,
        rowIndexes,
        columnNames,
        componentTypes
      }).mergeMap(({ workbook, view, componentType, row }) => {
        const { _index } = row;
        const basePath =
          `workbooksById['${workbook.id}']` +
          `.viewsById['${view.id}']` +
          `.componentsByType['${componentType}']` +
          `.rows[${_index}]`;

        return columnNames.map(columnName =>
          $value(`${basePath}['${columnName}']`, row[columnName])
        );
      });
    }

    function filterRowsByColumnAndValue(path, [name, dataType, values = []]) {
      const workbookIds = [].concat(path[1]);
      const viewIds = [].concat(path[3]);
      const { componentTypes = [] } = path;
      const map = values.reduce((map, val) => {
        map[val] = true;
        return map;
      }, {});

      return loadViewsById({
        workbookIds,
        viewIds
      })
        .mergeMap(
          ({ workbook, view }) => componentTypes,
          ({ workbook, view }, componentType) => ({
            workbook,
            view,
            componentType
          })
        )
        .mergeMap(({ workbook, view, componentType }) => {
          const { nBody: { dataframe, vgraphLoaded } } = view;
          if (!dataframe || !vgraphLoaded) {
            return [];
          }

          const masks = dataframe.getAttributeMask(
            componentType,
            name,
            x => values.some(y => x == y),
            false
          );

          const length = masks.numByType(componentType);
          const basePath =
            `workbooksById['${workbook.id}']` +
            `.viewsById['${view.id}']` +
            `.componentsByType['${componentType}']` +
            `.rows`;
          return [
            $value(`${basePath}.filter.length`, length),
            ...masks.mapIndexesByType(componentType, (_index, i) =>
              $value(`${basePath}.filter[${i}]`, $ref(`${basePath}[${_index}]`))
            )
          ];
        });
    }
  };
}

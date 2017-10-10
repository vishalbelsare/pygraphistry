export function columns(dataframe, columnsByComponentType) {
  const columns = {},
    allColumnsByType = {};

  /*        { point, edge } */
  for (const componentType in columnsByComponentType) {
    const columnsByName = columnsByComponentType[componentType];
    const columnsForComponent =
      allColumnsByType[componentType] || (allColumnsByType[componentType] = {});

    for (const columnName in columnsByName) {
      const column = columnsByName[columnName];
      columnsForComponent[columnName] = column;

      // If column.name is different than the columnName key,
      // insert the column with the name as well.
      if (column.name !== columnName && !columnsForComponent[column.name]) {
        columnsForComponent[column.name] = column;
      }
    }
  }

  const { point: pointColumns, edge: edgeColumns } = allColumnsByType;

  if (pointColumns) {
    for (const columnName in pointColumns) {
      const column = pointColumns[columnName];
      const attribute = columnName.indexOf('point:') === 0 ? columnName : `point:${columnName}`;

      if (edgeColumns && edgeColumns.hasOwnProperty(columnName)) {
        const edgeColumn = edgeColumns[columnName];
        const edgeAttribute = columnName.indexOf('edge:') === 0 ? columnName : `edge:${columnName}`;

        columns[attribute] = {
          attribute,
          name: columnName,
          dataType: column.type,
          identifier: attribute,
          componentType: 'point',
          isPrivate: dataframe.isAttributeNamePrivate(columnName),
          isInternal: dataframe.isAttributeNameInternal(columnName)
        };

        columns[edgeAttribute] = {
          name: columnName,
          attribute: edgeAttribute,
          dataType: edgeColumn.type,
          identifier: edgeAttribute,
          componentType: 'edge',
          isPrivate: dataframe.isAttributeNamePrivate(columnName),
          isInternal: dataframe.isAttributeNameInternal(columnName)
        };
      } else if (!columns.hasOwnProperty(columnName)) {
        columns[attribute] = {
          attribute,
          name: columnName,
          dataType: column.type,
          identifier: attribute,
          componentType: 'point',
          isPrivate: dataframe.isAttributeNamePrivate(columnName),
          isInternal: dataframe.isAttributeNameInternal(columnName)
        };
      }
    }
  }

  if (edgeColumns) {
    for (const columnName in edgeColumns) {
      const column = edgeColumns[columnName];
      const attribute = columnName.indexOf('edge:') === 0 ? columnName : `edge:${columnName}`;
      if (!columns.hasOwnProperty(columnName)) {
        columns[attribute] = {
          attribute,
          name: columnName,
          dataType: column.type,
          identifier: attribute,
          componentType: 'edge',
          isPrivate: dataframe.isAttributeNamePrivate(columnName),
          isInternal: dataframe.isAttributeNameInternal(columnName)
        };
      }
    }
  }

  return Object.keys(columns)
    .map(key => columns[key])
    .sort((a, b) => {
      let { componentType: aType, name: aName } = a;
      let { componentType: bType, name: bName } = b;
      if (aType === bType) {
        return aName.toLowerCase() < bName.toLowerCase() ? -1 : 1;
      }
      return aType < bType ? 1 : aName.toLowerCase() < bName.toLowerCase() ? -1 : 0;
    });
}

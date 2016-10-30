export function columns(columnsByComponentType) {

    const columns = {}, allColumnsByType = {};

    /*        { point, edge } */
    for (const componentType in columnsByComponentType) {

        const columnsByName = columnsByComponentType[componentType];
        const columnsForComponent = allColumnsByType[componentType] || (
            allColumnsByType[componentType] = {});

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

    for (const columnName in pointColumns) {

        const column = pointColumns[columnName];
        const attribute = columnName.indexOf('point:') === 0 ? columnName : `point:${columnName}`;

        if (edgeColumns.hasOwnProperty(columnName)) {

            const edgeColumn = edgeColumns[columnName];
            const edgeAttribute = columnName.indexOf('edge:') === 0 ? columnName : `edge:${columnName}`;

            columns[attribute] = {
                attribute,
                name: columnName,
                dataType: column.type,
                identifier: attribute,
                componentType: 'point'
            };

            columns[edgeAttribute] = {
                name: columnName,
                attribute: edgeAttribute,
                dataType: edgeColumn.type,
                identifier: edgeAttribute,
                componentType: 'edge'
            };

        } else if (!columns.hasOwnProperty(columnName)) {
            columns[attribute] = {
                attribute,
                name: columnName,
                dataType: column.type,
                identifier: attribute,
                componentType: 'point'
            };
        }
    }

    for (const columnName in edgeColumns) {
        const column = edgeColumns[columnName];
        const attribute = columnName.indexOf('edge:') === 0 ? columnName : `edge:${columnName}`;
        if (!columns.hasOwnProperty(columnName)) {
            columns[attribute] = {
                attribute,
                name: columnName,
                dataType: column.type,
                identifier: attribute,
                componentType: 'edge'
            };
        }
    }

    return Object
        .keys(columns)
        .map((key) => columns[key])
        .sort((a, b) => {
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();
            return aName === bName ? 0
                : aName < bName ? -1
                : -1;
        });
}

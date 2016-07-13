export function getIDsFromJSON({ rowsById = {} }) {

    const rowIds = [];
    const columnIndexes = [];

    for (const rowId in rowsById) {

        rowIds.push(rowId);

        const row = rowsById[rowId] || {};

        for (const columnIndex in row) {
            columnIndexes.push(columnIndex);
        }
    }

    return { rowIds, columnIndexes };
}

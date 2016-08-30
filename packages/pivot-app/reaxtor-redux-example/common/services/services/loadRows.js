export function loadRows(loadApp) {
    return function loadRowsById({ rowIds }) {
        return loadApp().mergeMap(
            (app) => rowIds.filter((rowId) => (
                rowId in app.rowsById
            )),
            (app, rowId) => ({
                app, row: app.rowsById[rowId]
            })
        );
    }
}

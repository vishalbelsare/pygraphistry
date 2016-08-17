export function loadPivots(loadApp) {
    return function loadPivotsById({ pivotIds }) {
        return loadApp().mergeMap(
            (app) => pivotIds.filter((pivotId) => (
                pivotId in app.pivotsById
            )),
            (app, pivotId) => ({
                app, pivot: app.pivotsById[pivotId]
            })
        );
    }
}

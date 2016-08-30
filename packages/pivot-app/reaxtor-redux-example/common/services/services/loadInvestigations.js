export function loadInvestigations(loadApp) {
    return function loadInvestigationsById({ investigationIds }) {
        return loadApp().mergeMap(
            (app) => investigationIds.filter((investigationId) => (
                investigationId in app.investigationsById
            )),
            (app, investigationId) => ({
                app, investigation: app.investigationsById[investigationId]
            })
        );
    };
}

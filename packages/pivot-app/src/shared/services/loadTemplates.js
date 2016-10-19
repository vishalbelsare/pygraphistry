export function templateStore(loadApp) {
    function loadTemplatesById({ templateIds }) {
        return loadApp()
            .mergeMap(
                (app) => templateIds.filter((templateId) => (
                    templateId in app.templatesById
                )),
                (app, templateId) => ({
                    app, template: app.templatesById[templateId]
                })
            );
    }

    return {
        loadTemplatesById: loadTemplatesById
    };
}

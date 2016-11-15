export function connectorStore(loadApp) {
    function loadConnectorsById({ connectorIds }) {
        return loadApp()
            .mergeMap(
                (app) => connectorIds.filter((connectorId) => (
                    connectorId in app.connectorsById
                )),
                (app, userId) => ({
                    app, connector: app.connectorsById[userId]
                })
            );
    }

    return {
        loadConnectorsById: loadConnectorsById
    };
}


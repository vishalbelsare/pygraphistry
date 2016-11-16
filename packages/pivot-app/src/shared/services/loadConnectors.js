export function connectorStore(loadApp) {
    function loadConnectorsById({ connectorIds }) {
        return loadApp()
            .mergeMap(
                (app) => connectorIds.filter((connectorId) => (
                    connectorId in app.connectorsById
                )),
                (app, connectorId) => ({
                    app, connector: app.connectorsById[connectorId]
                })
            );
    }

    return {
        loadConnectorsById: loadConnectorsById
    };
}


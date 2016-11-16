import _ from 'underscore';
import * as connectors from './connectors';

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

export function listConnectors() {
    const connectorMap  = _.mapObject(
        _.groupBy(
            _.values(connectors),
            t => t.id
        ),
        group => group[0]
    );
    return connectorMap;
}


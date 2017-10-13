import * as connectors from './connectors';
import { SimpleCacheService } from './support';
import logger from 'pivot-shared/logger';
import { Observable } from 'rxjs';
const log = logger.createLogger(__filename);

export function connectorStore(loadApp) {
    const connectorsMap = listConnectors();

    function loadConnectorById(connectorId) {
        return Observable.of(connectorsMap[connectorId]);
    }

    const service = new SimpleCacheService({
        loadApp: loadApp,
        resultName: 'connector',
        loadById: loadConnectorById,
        createModel: obj => obj,
        cache: {}
    });

    function loadConnectorsById({ connectorIds }) {
        return service.loadByIds(connectorIds);
    }

    return {
        loadConnectorsById: loadConnectorsById
    };
}

export function listConnectors() {
    return Object.values(connectors).reduce(function(connectorsById, connector) {
        connectorsById[connector.id] = connector;
        return connectorsById;
    }, {});
}

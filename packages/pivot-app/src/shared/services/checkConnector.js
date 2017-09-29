import { Observable } from 'rxjs';
import { listConnectors } from '.';
import logger from 'pivot-shared/logger';
import VError from 'verror';

const log = logger.createLogger(__filename);

const connectorMap = listConnectors();

export function checkConnector({ loadConnectorsById, connectorIds }) {
    return loadConnectorsById({ connectorIds })
        .mergeMap(({app, connector}) => {
            const connectorClass = connectorMap[connector.id];

            log.debug(`Checking connector: ${connector.id}`);
            return connectorClass.healthCheck()
                .do((response) => {
                    const lastUpdated = Date.now();
                    connector.status = {
                        enabled: true,
                        level: 'success',
                        message: response,
                        lastUpdated: lastUpdated
                    };
                })
                .map(() => ({app, connector}))
                .catch((e) =>
                    Observable.throw(
                        new VError.WError({
                            name:'ConnectorCheckFailed',
                            cause:e,
                        }, 'Connector check failed for : "%s"', connector.id)
                    )
                );
        });
}

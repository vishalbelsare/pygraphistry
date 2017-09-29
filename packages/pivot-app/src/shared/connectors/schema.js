import { Observable } from 'rxjs';
import { withSchema } from '@graphistry/falcor-react-schema';
import { logErrorWithCode } from 'pivot-shared/util';
import { $pathValue } from '@graphistry/falcor-json-graph';

import VError from 'verror';
import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);

export default withSchema((QL, { get, set }, services) => {

    const { loadConnectorsById } = services;

    const readWriteHandler = {
        get: get(loadConnectorsById),
        set: set({
            unboxAtoms: false,
            service: loadConnectorsById
        })
    };

    const checkStatusHandler = { call: checkStatusCallRoute(services) };

    return QL`{
        ['id', 'name', 'status', 'lastUpdated']: ${
            readWriteHandler
        },
        checkStatus: ${
            checkStatusHandler
        }
    }`
});

function checkStatusCallRoute({ loadConnectorsById, checkConnector }) {
    return function({ connectorIds }) {

        const connectorChecks = checkConnector({ loadConnectorsById, connectorIds })
            .mergeMap(({ connector }) => (
               [ $pathValue(`connectorsById['${connector.id}'].status`, connector.status) ]
            ))
            .catch(captureErrorAndNotifyClient(connectorIds));

        const statusReports = Observable
            .from(connectorIds)
            .map((connectorId) => $pathValue(
                `connectorsById['${connectorId}'].status`,
                {
                    enabled: false,
                    level: 'default',
                    message: 'Running health check...'
                }
            ));

        return statusReports.concat(connectorChecks);
    };
}

function captureErrorAndNotifyClient(connectorIds) {
    return function(e) {
        const errorCode = logErrorWithCode(log, e);
        const cause = VError.cause(e);
        const status = {
            enabled: true,
            level: 'danger',
            code: errorCode,
            message: `${cause.message} (code: ${errorCode})`
        };

        return Observable.from([
            $pathValue(`connectorsById['${connectorIds}']['status']`, status)
        ]);
    }
}

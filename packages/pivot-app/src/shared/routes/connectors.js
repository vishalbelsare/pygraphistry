import { listConnectors } from '../services';
import { Observable } from 'rxjs';
import { simpleflake } from 'simpleflakes';
import {
    pathValue as $pathValue,
    pathInvalidation as $invalidation,
    error as $error
} from '@graphistry/falcor-json-graph';
import {
    getHandler,
    setHandler,
    logErrorWithCode
} from './support';
import VError from 'verror';
import logger from '../logger.js';
const log = logger.createLogger(__filename);

const connectorList = listConnectors();

export function connectors({ loadConnectorsById, checkConnector }) {
    const getConnectorsHandler = getHandler(['connector'], loadConnectorsById);
    const setConnectorsHandler = setHandler(['connector'], loadConnectorsById);

    return [{
        route: `connectorsById[{keys}]['name', 'status', 'lastUpdated', 'id']`,
        returns: `String`,
        get: getConnectorsHandler,
        set: setConnectorsHandler,
    },{
        route: `connectorsById[{keys}].checkStatus`,
        returns: `String`,
        call: checkStatusCallRoute({ loadConnectorsById, checkConnector })
    }];
}

function checkStatusCallRoute({ loadConnectorsById, checkConnector }) {
    return function(path, args) {
        const connectorIds = path[1];

        return checkConnector({ loadConnectorsById, connectorIds })
            .mergeMap(({app, connector}) => (
               [ $pathValue(`connectorsById['${connector.id}'].status`, connector.status) ]
            ))
            .catch(captureErrorAndNotifyClient(connectorIds));
    };
}

function captureErrorAndNotifyClient(connectorIds) {
    return function(e) {
        const errorCode = logErrorWithCode(log, e);
        const cause = VError.cause(e);
        const status = {
            level: 'danger',
            code: errorCode,
            message: `${cause.message} (code: ${errorCode})`
        };

        return Observable.from([
            $pathValue(`connectorsById['${connectorIds}']['status']`, status)
        ]);
    }
}

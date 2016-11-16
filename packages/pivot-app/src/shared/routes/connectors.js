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
const log = logger.createLogger('pivot-app', __filename);


export function connectors({ loadConnectorsById }) {
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
        call: checkStatusCallRoute({ loadConnectorsById })
    }];
}

function checkStatusCallRoute({ loadConnectorsById }) {
    return function(path, args) {
        const connectorIds = path[ 1 ];

        return loadConnectorsById({ connectorIds })
            .mergeMap(({app, connector}) => (
               [$pathValue(`connectorsById['${connector.id}'].status`, 'warning')]
            ));
    };
}

function captureErrorAndNotifyClient(pivotIds) {
    return function(e) {
        const errorCode = logErrorWithCode(log, e);
        const cause = VError.cause(e);
        const status = {
            ok: false,
            code: errorCode,
            message: `${cause.message} (code: ${errorCode})`
        };

        return Observable.from([
            $pathValue(`connectorsById['${pivotIds}']['status']`, $error(status))
        ]);
    }
}

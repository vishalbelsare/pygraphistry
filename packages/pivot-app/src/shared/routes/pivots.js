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


export function pivots(services) {
    const getPivotsHandler = getHandler(['pivot'], services.loadPivotsById);
    const setPivotsHandler = setHandler(['pivot'], services.loadPivotsById);

    return [{
        route: `pivotsById[{keys}].length`,
        returns: `Number`,
        get: getPivotsHandler,
    }, {
        route: `pivotsById[{keys}]['enabled', 'status']`,
        returns: `String`,
        get: getPivotsHandler,
        set: setPivotsHandler,
    }, {
        route: `pivotsById[{keys}]['id', 'resultCount', 'resultSummary']`,
        returns: `String`,
        get: getPivotsHandler,
    }, {
        route: `pivotsById[{keys}]['pivotTemplate']`,
        returns: `$ref('templatesById[{templateId}]'`,
        get: getPivotsHandler,
        set: setPivotsHandler
    }, {
        route: `pivotsById[{keys}]['pivotParameters'][{keys}]`,
        returns: `String | Number`,
        get: getPivotsHandler,
        set: setPivotsHandler,
    }, {
        route: `pivotsById[{keys}].searchPivot`,
        call: searchPivotCallRoute(services)
    }];
}

function searchPivotCallRoute({ loadInvestigationsById, loadPivotsById, searchPivot }) {
    return function(path, args) {
        const pivotIds = path[1];
        const investigationId = args[0];

        return searchPivot({ loadInvestigationsById, loadPivotsById, pivotIds, investigationId })
            .mergeMap(({ app, pivot }) => {
                return [
                    $pathValue(`pivotsById['${pivot.id}']['resultCount']`, pivot.resultCount),
                    $pathValue(`pivotsById['${pivot.id}']['resultSummary']`, pivot.resultSummary),
                    $pathValue(`pivotsById['${pivot.id}']['enabled']`, pivot.enabled),
                    $pathValue(`pivotsById['${pivot.id}']['status']`, pivot.status)
                ];
            })
            .catch(captureErrorAndNotifyClient(pivotIds))
    }
}

function captureErrorAndNotifyClient(pivotIds) {
    return function(e) {
        const errorCode = logErrorWithCode(log, e);
        const cause = VError.cause(e);
        const status = {
            ok: false,
            searching: false,
            code: errorCode,
            message: `${cause && cause.message || e.message} (code: ${errorCode})`,
            title: 'Error running pivot!'
        };

        return Observable.from([
            $pathValue(`pivotsById['${pivotIds}']['status']`, $error(status)),
            $pathValue(`pivotsById['${pivotIds}']['enabled']`, false),
        ]);
    }
}

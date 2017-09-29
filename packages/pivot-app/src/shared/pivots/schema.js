import VError from 'verror';
import { Observable } from 'rxjs';
import { ErrorObservable } from 'rxjs/observable/ErrorObservable';
import { withSchema } from '@graphistry/falcor-react-schema';
import { logErrorWithCode } from 'pivot-shared/util';
import { $pathValue } from '@graphistry/falcor-json-graph';

import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);

export default withSchema((QL, { get, set }, services) => {

    const { loadPivotsById } = services;
    const readOnlyHandler = {
        get: get(loadPivotsById)
    };
    const readWriteHandler = {
        get: get(loadPivotsById),
        set: set({
            unboxAtoms: false,
            service: loadPivotsById
        })
    };

    const searchPivotHandler = {
        call: searchPivotCallRoute(services)
    };

    return QL`{
        ['id', 'length', 'resultCount', 'resultSummary']: ${
            readOnlyHandler
        },
        ['status', 'enabled', 'description', 'pivotTemplate']: ${
            readWriteHandler
        },
        pivotParameters: {
            [{ keys }]: ${
                readWriteHandler
            }
        },
        searchPivot: ${
            searchPivotHandler
        }
    }`;
});

function searchPivotCallRoute({ loadInvestigationsById, loadPivotsById, searchPivot }) {
    return function(path, args) {
        const pivotIds = path[1];
        const investigationId = args[0];

        return searchPivot({ loadInvestigationsById, loadPivotsById, pivotIds, investigationId })
            .mergeMap(({ pivot }) => {
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

    const captureErrorAndNotifyClientFlat = function (e) {
        const exn = e instanceof Error ? e : new Error(e);
        const errorCode = logErrorWithCode(log, exn);
        const cause = VError.cause(exn);
        const status = {
            ok: false,
            searching: false,
            code: errorCode,
            message: `${cause && cause.message || exn.message} (code: ${errorCode})`,
            title: 'Error running pivot!'
        };

        return Observable.from([
            $pathValue(`pivotsById['${pivotIds}']['status']`, status)
        ]);
    };


    return function (e) {
        if (e instanceof ErrorObservable) {
            return e
                .catch((e) => Observable.of(e))
                .switchMap((e) => captureErrorAndNotifyClientFlat(e))
        } else {
            return captureErrorAndNotifyClientFlat(e);
        }
    };

}


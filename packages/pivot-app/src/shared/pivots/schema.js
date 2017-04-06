import VError from 'verror';
import { Observable } from 'rxjs';
import { withSchema } from '@graphistry/falcor-react-schema';
import { logErrorWithCode } from 'pivot-shared/util';
import { $pathValue } from '@graphistry/falcor-json-graph';

import logger from 'pivot-shared/logger.js';
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
        ['status', 'enabled', 'pivotTemplate']: ${
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
            $pathValue(`pivotsById['${pivotIds}']['status']`, status)
        ]);
    }
}

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
    logErrorWithCode,
    mapObjectsToAtoms
} from './support';

export function pivots({loadPivotsById, searchPivot}) {
    const getPivotsHandler = getHandler(['pivot'], loadPivotsById);
    const setPivotsHandler = setHandler(['pivot'], loadPivotsById);

    return [{
        route: `pivotsById[{keys}].length`,
        returns: `Number`,
        get: getPivotsHandler,
    }, {
        route: `pivotsById[{keys}]['enabled']`,
        returns: `String`,
        get: getPivotsHandler,
        set: setPivotsHandler,
    }, {
        route: `pivotsById[{keys}]['id', 'resultCount', 'resultSummary', 'status']`,
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
        call: searchPivotCallRoute({loadPivotsById, searchPivot})
    }];
}

function searchPivotCallRoute({ loadPivotsById, searchPivot }) {
    return function(path, args) {
        const pivotIds = path[1];

        // Needed in order to set 'Pivot #' Attribute (Demo)
        // Should probably remove.
        const rowIds = args;

        return Observable.defer(() => searchPivot({loadPivotsById, pivotIds, rowIds}))
            .mergeMap(({app, pivot}) => {
                return [
                    $pathValue(`pivotsById['${pivot.id}']['resultCount']`, pivot.resultCount),
                    $pathValue(`pivotsById['${pivot.id}']['resultSummary']`, pivot.resultSummary),
                    $pathValue(`pivotsById['${pivot.id}']['enabled']`, pivot.enabled),
                    $pathValue(`pivotsById['${pivot.id}']['status']`, pivot.status)
                ];
            })
            .map(mapObjectsToAtoms)
            .catch(captureErrorAndNotifyClient(pivotIds))
    }
}

function captureErrorAndNotifyClient(pivotIds) {
    return function(e) {
        const errorCode = logErrorWithCode(e);
        const status = {
            ok: false,
            code: errorCode,
            message: `Server Error (code: ${errorCode})`
        }

        return Observable.from([
            $pathValue(`pivotsById['${pivotIds}']['status']`, $error(status))
        ]);
    }
}

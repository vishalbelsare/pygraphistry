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
        returns: `Number`,
        get: getPivotsHandler,
        route: `pivotsById[{keys}].length`
    }, {
        returns: `String`,
        get: getPivotsHandler,
        set: setPivotsHandler,
        route: `pivotsById[{keys}]['enabled']`
    }, {
        returns: `String`,
        get: getPivotsHandler,
        route: `pivotsById[{keys}]['id', 'total', 'resultCount', 'resultSummary',
                                   'status', 'pivotParameterKeys']`
    }, {
        returns: `String | Number`,
        get: getPivotsHandler,
        set: setPivotsHandler,
        route: `pivotsById[{keys}]['pivotParameters'][{keys}]`
    }, {
        route: `pivotsById[{keys}].searchPivot`,
        call: searchPivotCallRoute({loadPivotsById, searchPivot})
    }];
}

function searchPivotCallRoute({loadPivotsById, searchPivot}) {
    return function(path, args) {
        const pivotIds = path[1];

        // Needed in order to set 'Pivot #' Attribute (Demo)
        // Should probably remove.
        const rowIds = args;

        Observable.defer(() => searchPivot({loadPivotsById, pivotIds, rowIds}))
        .catch(captureErrorAndNotifyClient(pivotIds))
        .subscribe(
            ({app, pivot}) => {
                console.log('Finished searching', pivot.id);
                pivot.status = {
                    ok: true,
                    message: 'done'
                };
            },
        );

        return Observable.of([]);
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

import { Observable } from 'rxjs';
import {
    pathValue as $pathValue,
    pathInvalidation as $invalidation,
    error as $error
} from '@graphistry/falcor-json-graph';
import {
    getHandler,
    setHandler,
    captureErrorStacks,
    mapObjectsToAtoms
} from './support';

export function pivots({loadPivotsById, calcTotals, searchPivot}) {
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
        route: `pivotsById[{keys}]['id', 'total', 'resultCount', 'resultSummary']`
    }, {
        returns: `String | Number`,
        get: getPivotsHandler,
        set: setPivotsHandler,
        route: `pivotsById[{keys}][{integers}]['name', 'value']`
    }, {
        route: `pivotsById[{keys}].searchPivot`,
        call: searchPivotCallRoute({loadPivotsById, searchPivot})
    }];
}

function searchPivotCallRoute({loadPivotsById, searchPivot}) {
    return function searchPivotCall(path, args) {
        const pivotIds = path[1];

        return Observable.defer(() => searchPivot({loadPivotsById, pivotIds}))
            .mergeMap(({app, pivot}) => {
                console.log('NORMAL CLIENT RESPONSE PATH')
                console.log(pivot.status)
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
        console.log('HARD ERRORS', e)
        captureErrorStacks(e);

        console.log($error, $error('test'))
        console.log($pathValue(`pivotsById['${pivotIds}']['status']`, $error('$error error')))

        //return Observable.from([]);
        return Observable.from([
            $pathValue(`pivotsById['${pivotIds}']['status']`, $error('$error error'))
        ]);
    }
}

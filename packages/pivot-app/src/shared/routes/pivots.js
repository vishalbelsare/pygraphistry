import {
    pathValue as $pathValue,
    pathInvalidation as $invalidation
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

        return searchPivot({loadPivotsById, pivotIds})
            .mergeMap(({app, pivot}) => {
                return [
                    $pathValue(`pivotsById['${pivot.id}']['resultCount']`, pivot.resultCount),
                    $pathValue(`pivotsById['${pivot.id}']['resultSummary']`, pivot.resultSummary),
                    $pathValue(`pivotsById['${pivot.id}']['enabled']`, pivot.enabled),
                ];

            })
            .map(mapObjectsToAtoms)
            .catch(captureErrorStacks)
    }
}

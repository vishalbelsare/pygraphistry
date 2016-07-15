import {
    pathValue as $pathValue
} from '@graphistry/falcor-json-graph';

import { getHandler,
        setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from './support';

export function pivots({ loadPivotsById, calcTotals }) {

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
        route: `pivotsById[{keys}]['id', 'total', 'resultCount']`
    }, {
        returns: `String | Number`,
        get: getPivotsHandler,
        set: setPivotsHandler,
        route: `pivotsById[{keys}][{integers}]['name', 'value']`
    }];
}

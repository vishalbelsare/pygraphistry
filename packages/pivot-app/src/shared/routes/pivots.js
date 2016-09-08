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
    },{
        returns: `String`,
        call: setColumnValueCallRoute({ loadPivotsById, calcTotals }),
        route: `pivotsById[{keys}][{integers}].setValue`
    }];
}

function setColumnValueCallRoute({ loadPivotsById, calcTotals }) {
    return function setColumnValue(path, args) {

        const [ value ] = args;
        const pivotIds = [].concat(path[1]);
        const columnIndexes = [].concat(path[2]);

        return loadPivotsById({ pivotIds })
            .mergeMap(
                ({ app, pivot }) => columnIndexes,
                ({ app, pivot }, index) => ({
                    app, pivot, index
                })
            )
            .map(({ app, pivot, index }) => {
                const column = pivot[index];
                column.value = value;
                return { app, pivot, index, column };
            })
            .mergeMap(({ app, pivot, index, column }) => [
                $pathValue(`total`, app.total),
                //$pathValue(`rowsById['${row.id}'].total`, row.total),
                $pathValue(`pivotsById['${pivot.id}'][${index}].value`, column.value),
            ])
            .map(mapObjectsToAtoms)
            .catch(captureErrorStacks);
    }
}

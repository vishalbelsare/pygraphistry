import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue
} from 'falcor-json-graph';

import { Observable } from 'rxjs';
import { getHandler,
        setHandler,
         getIDsFromJSON,
         mapObjectsToAtoms,
         captureErrorStacks } from './support';

export function rows({ loadPivotsById, calcTotals }) {

    const getPivotsHandler = getHandler(['pivot'], loadPivotsById);
    const setPivotsHandler = setHandler(['pivot'], loadPivotsById);

    return [{
        returns: `Number`,
        get: getPivotsHandler,
        route: `pivotsById[{keys}].length`
    }, {
        returns: `String`,
        get: getPivotsHandler,
        route: `pivotsById[{keys}]['id', 'total', 'enabled', 'resultCount']`
    }, {
        returns: `String | Number`,
        get: getPivotsHandler,
        set: setPivotsHandler,
        route: `pivotsById[{keys}][{integers}]['name', 'value']`
    },{
        returns: `String`,
        call: setColumnValueCallRoute({ loadPivotsById, calcTotals }),
        route: `pivotsById[{keys}][{integers}].setValue`
    },{
        returns: `String`,
        call: togglePivotCallRoute({ loadPivotsById }),
        route: `pivotsById[{keys}].togglePivot`
    }];
}

function togglePivotCallRoute({loadPivotById}) {
    return function togglePivot(path, args) {
        const pivotIds = [].concat(path[1]);
        const columnIndexes = [].concat(path[2]);

        return loadPivotById({ pivotIds })
            .mergeMap(
                ({ app, pivot }) => columnIndexes,
                ({ app, pivot }, index) => ({
                    app, row, index
                })
            )
            .map(({ app, pivot, index }) => {
                pivot.enabled = !pivot.enabled;
                const enabled = pivot.enabled;
                return { app, pivot, index, enabled};
            })
            .mergeMap(({ app, pivot, index, enabled }) => [
                $pathValue(`pivotsById['${row.id}'].enabled`, row.enabled),
            ])
            .map(mapObjectsToAtoms)
            .catch(captureErrorStacks);
    }

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

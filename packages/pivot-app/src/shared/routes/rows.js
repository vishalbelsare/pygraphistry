import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue
} from 'falcor-json-graph';

import { Observable } from 'rxjs';
import { getHandler,
         getIDsFromJSON,
         mapObjectsToAtoms,
         captureErrorStacks } from './support';

export function rows({ loadRowsById, calcTotals }) {

    const getRowsHandler = getHandler(['row'], loadRowsById);

    return [{
        returns: `Number`,
        get: getRowsHandler,
        route: `rowsById[{keys}].length`
    }, {
        returns: `String`,
        get: getRowsHandler,
        route: `rowsById[{keys}]['id', 'total', 'enabled']`
    }, {
        get: getRowsHandler,
        returns: 'String | Number',
        route: `rowsById[{keys}][{integers}]['name', 'value']`
    }, {
        returns: `String`,
        call: setColumnValueCallRoute({ loadRowsById, calcTotals }),
        route: `rowsById[{keys}][{integers}].setValue`
    },{
        returns: `String`,
        call: togglePivotCallRoute({loadRowsById}),
        route: `rowsById[{keys}].togglePivot`
    }];
}

function togglePivotCallRoute({loadRowsById}) {
    return function togglePivot(path, args) {
        const rowIds = [].concat(path[1]);
        const columnIndexes = [].concat(path[2]);

        return loadRowsById({ rowIds })
            .mergeMap(
                ({ app, row }) => columnIndexes,
                ({ app, row }, index) => ({
                    app, row, index
                })
            )
            .map(({ app, row, index }) => {
                row.enabled = !row.enabled;
                const enabled = row.enabled;
                return { app, row, index, enabled};
            })
            .mergeMap(({ app, row, index, enabled }) => [
                $pathValue(`rowsById['${row.id}'].enabled`, row.enabled),
            ])
            .map(mapObjectsToAtoms)
            .catch(captureErrorStacks);
    }

}

function setColumnValueCallRoute({ loadRowsById, calcTotals }) {
    return function setColumnValue(path, args) {

        const [ value ] = args;
        const rowIds = [].concat(path[1]);
        const columnIndexes = [].concat(path[2]);

        return loadRowsById({ rowIds })
            .mergeMap(
                ({ app, row }) => columnIndexes,
                ({ app, row }, index) => ({
                    app, row, index
                })
            )
            .map(({ app, row, index }) => {
                const column = row[index];
                column.value = value;
                return { app, row, index, column };
            })
            //.mergeMap(calcTotals)
            .mergeMap(({ app, row, index, column }) => [
                $pathValue(`total`, app.total),
                //$pathValue(`rowsById['${row.id}'].total`, row.total),
                $pathValue(`rowsById['${row.id}'][${index}].value`, column.value),
            ])
            .map(mapObjectsToAtoms)
            .catch(captureErrorStacks);
    }
}

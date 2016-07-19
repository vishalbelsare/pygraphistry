import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from 'falcor-json-graph';

import { getHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from './support';

export function app({ loadApp, calcTotals, insertRow, spliceRow, selectPivot }) {

    const appGetRoute = getHandler([], loadApp);

    return [{
        returns: `*`,
        get: appGetRoute,
        route: `['id', 'url', 'title', 'total', 'urls', 'urlIndex']`
    }, {
        get: appGetRoute,
        returns: 'String',
        route: `['cols'].id`
    }, {
        get: appGetRoute,
        returns: `String | Number`,
        route: `['cols', 'rows'].total`
    }, {
        returns: `Number`,
        route: `['cols', 'rows'].length`,
        get: listLengthGetRoute({ loadApp })
    }, {
        route: `['cols', 'rows'][{ranges}]`,
        get: rangesToListItemsGetRoute({ loadApp }),
        returns: `$ref('rowsById[{ rowId }]')`
    }, {
        route: `rows.insert`,
        call: insertRowCallRoute({ loadApp, calcTotals, insertRow, selectPivot })
    }, {
        route: `rows.splice`,
        call: spliceRowCallRoute({ loadApp, calcTotals, spliceRow, selectPivot })
    }, {
        route: `rows.selectPivot`,
        call: selectPivotCallRoute({ loadApp, calcTotals, spliceRow, selectPivot })
    }];
}

function listLengthGetRoute({ loadApp }) {
    return function getRowsLength(path) {

        // The Array of list names (either `cols` or `rows`) from which to
        // retrieve each range.
        const listNames = [].concat(path[0]);

        return loadApp().mergeMap(
            (app) => listNames,
            (app, listName) => $pathValue(
                `${listName}.length`, app[listName].length
            )
        );
    }
}

function rangesToListItemsGetRoute({ loadApp }) {
    return function rangesToListItems(path) {

        // The Array of list names (either `cols` or `rows`) from which to
        // retrieve each range.
        const listNames = [].concat(path[0])

        // An Array of Ranges ([{ from: int, to: int }, ...])
        //
        // A Range is a more compact way to represent an Array of consecutive
        // integers. Since Falcor communicates via JSON, Ranges are an
        // optimization to reduce transport size.
        // For example:
        // [0, 1, 2, 3 (,) ... 999, 1000] yields { from: 0, to: 1000 }
        //
        // Since non-consecutive integers can be requested, Falcor collapses
        // integer requests into an Array of Ranges, where each Range is a
        // consecutive integer list.
        // For example,
        // [0, 1, 2, 10, 11, 12] yields [{from: 0, to:2}, {from:10, to:12}]
        const ranges = [].concat(path[1]);

        // Convert the Ranges to an Array of integers
        const indexes = ranges.reduce(
            (indexes, { from, to }) => {
                return indexes.concat(
                    // Array.from({ length: <int> }, (e, i) => int) is a
                    // convenient and native way to create an Array from
                    // a range. Calculate offset with the range's `from`
                    // as an offset.
                    Array.from(
                        { length: to - from + 1 },
                        (x, index) => index + from
                    )
                );
        }, []);

        return loadApp()
            // enumerate each list from the app state ...
            .mergeMap(
                (app) => listNames,
                // Create an intermediate Object that preserves
                // both the list name and the list value.
                (app, name) => ({
                    name, list: app[name]
                })
            )
            // then enumerate each element from each list,
            // but don't enumerate indexes that aren't in the list.
            .mergeMap(
                ({ name, list }) => indexes.filter((index) => (
                    index < list.length
                )),
                ({ name, list }, index) => $pathValue(`
                    ${name}[${index}]`, list[index]
                )
            );
    }
}

function insertRowCallRoute({ loadApp, calcTotals, insertRow }) {
    return function insertRowCall(path, args) {
        const [id] = args;
        return loadApp().mergeMap(
            (app) => insertRow({ app, id }),
            (app, { row, index }) => ({
                app, row, index
            })
        )
        .mergeMap(calcTotals)
        .mergeMap(({ app, row, index }) => {
            const { rows } = app;
            const { length } = rows;
            app.urlIndex = (app.urlIndex + 1) % app.urls.length;
            const values = [
                $pathValue(`total`, app.total),
                $pathValue(`rows.length`, length),
                $pathValue(`rows[${index}]`, rows[index]),
                $pathValue(`urlIndex`, app.urlIndex),
            ];
            $invalidation('urlIndex')

            if (index < length - 1) {
                values.push($invalidation(`rows[${index + 1}..${length - 1}]`));
            }

            return values;
        })
        .map(mapObjectsToAtoms)
        .catch(captureErrorStacks);
    }
}

function selectPivotCallRoute({ loadApp, calcTotals, insertRow, selectPivot }) {
    return function selectPivotCall(path, args) {
        const [id] = args;
        return loadApp().mergeMap(
            (app) => selectPivot({ app, id }),
        )
        .mergeMap(({ app, index }) => {
            console.log("App url index", app.urlIndex);
            console.log("Index", index);
            const { rows } = app;
            const { length } = rows;
            const values = [
                $pathValue(`total`, app.total),
                $pathValue(`rows.length`, length),
                $pathValue(`rows[${index}]`, rows[index]),
                $pathValue(`urlIndex`, app.urlIndex),
            ];
            $invalidation('urlIndex')

            if (index < length - 1) {
                values.push($invalidation(`rows[${index + 1}..${length - 1}]`));
            }

            return values;
        })
        .map(mapObjectsToAtoms)
        .catch(captureErrorStacks);
    }
}

function spliceRowCallRoute({ loadApp, calcTotals, spliceRow }) {
    return function spliceRowCall(path, args) {
        const [id] = args;
        return loadApp().mergeMap(
            (app) => spliceRow({ app, id }),
            (app, { row, index }) => ({
                app, row, index
            })
        )
        .mergeMap(calcTotals)
        .mergeMap(({ app, row, index }) => {
            const { rows } = app;
            const { length } = rows;
            const values = [
                $pathValue(`total`, app.total),
                $pathValue(`rows.length`, length),
                $invalidation(`rowsById['${row.id}']`),
                $invalidation(`rows[${index}..${length}]`),
            ];

            return values;
        })
        .map(mapObjectsToAtoms)
        .catch(captureErrorStacks);
    }
}

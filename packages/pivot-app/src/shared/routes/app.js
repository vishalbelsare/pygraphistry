import { Observable } from 'rxjs';
import {
    ref as $ref,
    pathValue as $pathValue,
    pathInvalidation as $invalidation,
} from '@graphistry/falcor-json-graph';
import {
    getHandler,
    setHandler,
    logErrorWithCode
} from './support';

export function app({ loadApp, createInvestigation }) {

    const appGetRoute = getHandler([], loadApp);
    const appSetRoute = setHandler([], loadApp);

    return [{
        returns: `*`,
        get: appGetRoute,
        route: `['id', 'title', 'url']`
    }, {
        get: appGetRoute,
        set: appSetRoute,
        returns: `$ref('investigationsById[{investigationId}])`,
        route: `selectedInvestigation`
    }, {
        returns: `Number`,
        route: `['pivots', 'investigations'].length`,
        get: appGetRoute
    }, {
        route: `['cols'][{ranges}]`,
        get: rangesToListItemsGetRoute({ loadApp }),
        returns: `String`
    }, {
        route: `['pivots'][{ranges}]`,
        get: rangesToListItemsGetRoute({ loadApp }),
        returns: `$ref('pivotsById[{ pivotId }]')`
    }, {
        route: `['investigations'][{ranges}]`,
        get: rangesToListItemsGetRoute({ loadApp }),
        returns: `$ref('investigationsById[{investigationId}]')`
    }, {
        route: `createInvestigation`,
        call: createInvestigationCallRoute({ loadApp, createInvestigation })
    }];
}

function createInvestigationCallRoute({loadApp, createInvestigation}) {
    return function(path, args) {
        return Observable.defer(() => createInvestigation({loadApp}))
            .mergeMap(({app, numInvestigations}) => {
                return [
                    $pathValue(`['investigations'].length`, numInvestigations),
                    $pathValue(`selectedInvestigation`, app.selectedInvestigation),
                    $invalidation(`['investigations']['${numInvestigations - 1}']`)
                ];
            })
            .catch(logErrorWithCode);
    };
}

function rangesToListItemsGetRoute({ loadApp }) {
    return function rangesToListItems(path) {

        // The Array of list names (either `cols` or `rows`) from which to
        // retrieve each range.
        const listNames = [].concat(path[0]);

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
                ({ name, list }, index) => {
                    return $pathValue(` ${name}[${index}]`, list[index])
                }
            );
    };
}

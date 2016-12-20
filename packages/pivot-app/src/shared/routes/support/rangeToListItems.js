import {
    pathValue as $pathValue,
} from '@graphistry/falcor-json-graph';

export function rangesToListItems({ loadApp }) {
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
                () => listNames,
                // Create an intermediate Object that preserves
                // both the list name and the list value.
                (app, name) => ({
                    name, list: app[name]
                })
            )
            // then enumerate each element from each list,
            // but don't enumerate indexes that aren't in the list.
            .mergeMap(
                ({ list }) => indexes.filter((index) => (
                    index < list.length
                )),
                ({ name, list }, index) => {
                    return $pathValue(` ${name}[${index}]`, list[index])
                }
            );
    };
}

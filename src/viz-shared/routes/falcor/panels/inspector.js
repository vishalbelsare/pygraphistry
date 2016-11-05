import { Observable } from 'rxjs';

import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';
import Color from 'color';
import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

import _ from 'underscore';


export function inspector(path, base) {
    return function inspector({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);

        return [{
            returns: `*`,
            get: getValues,
            set: setValues,
            route: `${base}['inspector'][{keys}]`,
        }, {
            returns: `*`,
            get: getValues,
            set: setValues,
            route: `${base}['inspector'].query[{keys}]`,
        }, {
            get: getValues,
            route: `${base}['inspector'].controls[{keys}]`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['inspector'].controls[{keys}][{keys}]`
        }, {
            get: function (path) {
                console.console.log("path", JSON.stringify(path), path);
                const basePath = path.slice(0, path.length - 3);
                const openTabs = [].concat(path[path.length - 2]);
                const ranges = [].concat(path[path.length - 1]);
                return openTabs.reduce(
                    (values, openTab) => (
                        ranges.reduce(
                            (values, {from,to}) =>
                                values.concat(
                                    _.range(from, to + 1).map(
                                        (row) =>
                                            $value(
                                                basePath.concat([openTab,row]),
                                                $atom({value: 'row'+row, openTab})))),
                            values),
                    []));
            },
            route: `${base}['inspector'].rows[{keys:openTab}][{range}]`
        }];
    }
}

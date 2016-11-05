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
            route: `${base}['inspector']['open', 'length', 'id', 'name']`,
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
            returns: `*`,
            get: function (path) {
                const basePath = path.slice(0, path.length - 6);
                console.log('===== BASE PATH');
                console.log(basePath);

                const openTabs = [].concat(path[path.length - 6]);
                const searchTerms = [].concat(path[path.length - 5]);
                const sortKeys = [].concat(path[path.length - 4]);
                const sortOrders = [].concat(path[path.length - 3]);
                const ranges = [].concat(path[path.length - 2]);
                const fields = [].concat(path[path.length - 1]);

                const out =
                        openTabs.reduce((values, openTab) =>
                        searchTerms.reduce((values, searchTerm) =>
                        sortKeys.reduce((values, sortKey) =>
                        sortOrders.reduce((values, sortOrder) =>
                        ranges.reduce((values, {from,to}) =>
                        _.range(from, to).reduce((values, row) =>
                        fields.reduce((values, field) =>
                            values.concat([
                                $value(
                                    basePath.concat([openTab, searchTerm, sortKey, sortOrder, row, field]),
                                    Math.random())
                            ]),
                            values),
                            values),
                            values),
                            values),
                            values),
                            values),
                        []);
                console.log('emitting', (out||['mt'])[0]);
                return out;
            },
            route: `${base}['inspector'].rows[{keys:openTab}][{keys:searchTerm}][{keys:sortKey}][{keys:sortOrder}][{ranges:rows}][{keys:fields}]`
        }];
    }
}

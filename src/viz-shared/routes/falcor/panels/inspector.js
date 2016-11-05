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
                try {
                const basePath = path.slice(0, path.length - 4);
                const openTabs = [].concat(path[path.length - 3]);
                const ranges = [].concat(path[path.length - 2]);
                const fields = [].concat(path[path.length - 1]);
                const out = openTabs.reduce(
                    (values, openTab) =>
                        ranges.reduce(
                            (values, {from,to}) =>
                                _.range(from, to).reduce(
                                    (values, row) =>
                                        fields.reduce(
                                            (values, field) =>
                                                values.concat([$value(
                                                    basePath.concat([openTab,row,field]),
                                                    $atom({value: Math.random()}))]),
                                            values),
                                    values),
                            values),
                    []);
                    return out;
                } catch (e) {
                    console.error('error', e);
                }
            },
            route: `${base}['inspector'].rows[{keys}][{ranges}][{keys}]`
        }];
    }
}

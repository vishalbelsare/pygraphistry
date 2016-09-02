import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';

import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function expressions(path, base) {
    return function expressions({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);

        return [{
            returns: `*`,
            get: getValues,
            route: `${base}['expressions'][{keys}]`,
        }, {
            returns: `*`,
            get: getValues,
            route: `${base}['expressions'][{keys}][{keys}]`,
        }, {
            get: getValues,
            route: `${base}['expressionsById'][{keys}]`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['expressionsById'][{keys}][{keys}]`
        }];
    }
}

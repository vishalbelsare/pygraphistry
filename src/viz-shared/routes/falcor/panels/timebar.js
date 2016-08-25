import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';
import Color from 'color';
import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function timebar(path, base) {
    return function timebar({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);

        return [{
            returns: `*`,
            get: getValues,
            route: `${base}['timebar'][{keys}]`,
        }, {
            get: getValues,
            route: `${base}['timebar'].controls[{keys}]`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['timebar'].controls[{keys}][{keys}]`
        }];
    }
}

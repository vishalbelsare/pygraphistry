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

export function exclusions(path, base) {
    return function exclusions({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);

        return [{
            returns: `*`,
            get: getValues,
            route: `${base}['exclusions'][{keys}]`,
        }, {
            get: getValues,
            route: `${base}['exclusions'].controls[{keys}]`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['exclusions'].controls[{keys}][{keys}]`
        }];
    }
}

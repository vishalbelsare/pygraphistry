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

export function inspector(path, base) {
    return function inspector({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);

        return [{
            returns: `*`,
            get: getValues,
            route: `${base}['inspector'][{keys}]`,
        }, {
            get: getValues,
            route: `${base}['inspector'].controls[{keys}]`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['inspector'].controls[{keys}][{keys}]`
        }];
    }
}

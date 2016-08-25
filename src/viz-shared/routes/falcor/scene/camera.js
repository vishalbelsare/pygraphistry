import {
    ref as $ref,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';
import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function camera(path, base) {
    return function camera({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);

        return [{
            get: getValues,
            set: setValues,
            route: `${base}['camera'][{keys}]`,
            returns: `*`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['camera'][{keys}][{keys}]`,
            returns: `*`
        }, {
            get: getValues,
            route: `${base}['camera']['controls', 'options'][{keys}]`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['camera']['controls', 'options'][{keys}][{keys}]`
        }];
    }
}


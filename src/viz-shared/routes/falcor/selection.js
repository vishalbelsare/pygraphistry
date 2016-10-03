import {
    ref as $ref,
    pathValue as $value
} from '@graphistry/falcor-json-graph';
import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function selection(path, base) {
    return function selection({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);

        return [{
            get: getValues,
            route: `${base}['highlight', 'selection'][{keys}]`
        }, {
            set: setValues,
            route: `${base}['highlight', 'selection']['type', 'rect', 'label']`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['highlight', 'selection']['edge', 'point'][{keys}]`
        }, {
            get: getValues,
            route: `${base}['selection'].controls[{keys}]`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['selection'].controls[{keys}][{keys}]`
        }];
    }
}

import {
    ref as $ref,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';
import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function layout(path, base) {
    return function layout({ loadViewsById }) {
        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        return [{
            get: getValues,
            route: `${base}.layout[{keys}]`
        }, {
            get: getValues,
            route: `${base}.layout['options', 'settings'][{keys}]`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}.layout['options'][{keys}][{keys}]`
        }];
    }
}

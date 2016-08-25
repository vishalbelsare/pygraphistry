import {
    ref as $ref,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';
import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function scene(path, base) {
    return function scene({ loadViewsById, loadLabelsByIndexAndType }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);

        return [{
            returns: `*`,
            get: getValues,
            route: `${base}['scene'][{keys}]`
        }, {
            set: setValues,
            route: `${base}['scene'].simulating`
        }, {
            returns: `*`,
            get: getValues,
            route: `${base}['scene']['controls', 'settings'][{keys}]`
        }, {
            returns: `*`,
            get: getValues,
            set: setValues,
            route: `${base}['scene']['controls'][{keys}][{keys}]`
        }, {
            returns: `*`,
            get: getValues,
            route: `${base}['scene']['hints', 'server', 'options'][{keys}]`,
        }, {
            returns: `*`,
            get: getValues,
            set: setValues,
            route: `${base}['scene']['options'][{keys}][{keys}]`,
        }];
    }
}

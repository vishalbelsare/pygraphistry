import Color from 'color';
import {
    ref as $ref,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function toolbar(path, base) {
    return function toolbar({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);

        return [{
            returns: 'Reference',
            get: getValues,
            route: `${base}['toolbar']`
        }, {
            returns: 'Boolean',
            get: getValues,
            route: `${base}['toolbars'][{keys}].visible`
        }, {
            returns: '*',
            get: getValues,
            route: `${base}['toolbars'][{keys}]`
        }, {
            returns: '*',
            get: getValues,
            route: `${base}['toolbars'][{keys}][{keys}]`
        }, {
            returns: '*',
            get: getValues,
            route: `${base}['toolbars'][{keys}][{keys}][{keys}]`
        }];
    }
}

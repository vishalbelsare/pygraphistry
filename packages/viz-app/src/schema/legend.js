import { Observable } from 'rxjs';
import { $ref, $atom, $value, $invalidate } from '@graphistry/falcor-json-graph';
import { getHandler, setHandler } from 'viz-app/router';

export function legend(path, base) {
    return function legend({ loadViewsById }) {
        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);

        return [
            {
                get: getValues,
                set: setValues,
                route: `${base}['legend'][{keys}]`
            },
            {
                get: getValues,
                route: `${base}['legend'].controls[{keys}]`
            },
            {
                get: getValues,
                set: setValues,
                route: `${base}['legend'].controls[{keys}][{keys}]`
            }
        ];
    };
}

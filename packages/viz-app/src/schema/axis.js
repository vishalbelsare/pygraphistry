import { Observable } from 'rxjs';
import { getHandler, setHandler } from 'viz-app/router';
import { $ref, $value } from '@graphistry/falcor-json-graph';

export function axis(path, base) {
    return function axis({ loadViewsById, loadLabelsByIndexAndType }) {
        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);

        return [
            {
                get: getValues,
                set: setValues,
                route: `${base}['axis'][
                'id', 'name', 'encodings'
            ]`
            }
        ];
    };
}

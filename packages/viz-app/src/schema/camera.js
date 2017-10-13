import { getHandler, setHandler } from 'viz-app/router';

export function camera(path, base) {
    return function camera({ loadViewsById }) {
        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);

        return [
            {
                get: getValues,
                set: setValues,
                route: `${base}['camera'][{keys}]`,
                returns: `*`
            },
            {
                get: getValues,
                set: setValues,
                route: `${base}['camera'][{keys}][{keys}]`,
                returns: `*`
            },
            {
                get: getValues,
                route: `${base}['camera']['controls'][{keys}]`
            },
            {
                get: getValues,
                set: setValues,
                route: `${base}['camera']['controls'][{keys}][{keys}]`
            }
        ];
    };
}

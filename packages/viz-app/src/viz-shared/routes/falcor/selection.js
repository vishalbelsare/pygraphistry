import {
    ref as $ref,
    pathValue as $value
} from '@graphistry/falcor-json-graph';
import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function selection(path, base) {
    return function selection({ loadViewsById, loadHistogramsById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const setSelectionMask = setHandler(path, loadViewsById,
            (node, key, value, path, { view }) => {
                const { nBody: { dataframe } = {} } = view;
                view.inspector.rows = undefined;
                view.componentsByType = undefined;
                dataframe.lastTaggedSelectionMasks = undefined;
                return Observable.of({
                    path, value: node[key] = value
                });
            }
        );

        return [{
            get: getValues,
            route: `${base}['highlight', 'selection'][{keys}]`
        }, {
            set: setValues,
            route: `${base}['highlight']['mask']`
        }, {
            set: setSelectionMask,
            route: `${base}['selection']['mask']`
        }, {
            set: setValues,
            route: `${base}['highlight', 'selection'][
                'type', 'edge', 'label', 'point', 'darken'
            ]`
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

import { getHandler, setHandler } from 'viz-shared/routes';
import { $ref, $value, $invalidate } from '@graphistry/falcor-json-graph';

export function selection(path, base) {
    return function selection({ loadViewsById, loadHistogramsById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const setSelectionMask = setHandler(path, loadViewsById,
            (node, key, value, path, { workbook, view }) => {

                const { nBody: { dataframe = {} } = {} } = view;
                const viewPath = `workbooksById['${workbook.id}'].viewsById['${view.id}']`;

                view.inspector.rows = undefined;
                view.componentsByType = undefined;
                dataframe.lastTaggedSelectionMasks = undefined;

                return Observable.of(
                    $value(path, node[key] = value),
                    $invalidate(`${viewPath}.inspector.rows`),
                    $invalidate(`${viewPath}.componentsByType`),
                );
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

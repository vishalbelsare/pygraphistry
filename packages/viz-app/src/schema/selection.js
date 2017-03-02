import { Observable } from 'rxjs';
import shallowEqual from 'recompose/shallowEqual';
import { getHandler, setHandler } from 'viz-app/router';
import { $value, $invalidate } from '@graphistry/falcor-json-graph';

export function selection(path, base) {
    return function selection({ loadViewsById, loadHistogramsById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const setSelectionMask = setHandler(path, loadViewsById,
            (node, key, value, path, { workbook, view }) => {

                const invalidations = [];
                const { selection = {} } = view;

                if (selection.type === 'window' && !shallowEqual(node[key], value)) {

                    const { nBody: { dataframe = {} } = {} } = view;
                    const viewPath = `workbooksById['${workbook.id}'].viewsById['${view.id}']`;

                    view.inspector.rows = undefined;
                    view.componentsByType = undefined;
                    dataframe.lastTaggedSelectionMasks = undefined;

                    invalidations.push(
                        $invalidate(`${viewPath}.inspector.rows`),
                        $invalidate(`${viewPath}.componentsByType`),
                        $invalidate(`${viewPath}.selection.histogramsById`),
                    );
                }

                return Observable.of(...invalidations, $value(path, node[key] = value));
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

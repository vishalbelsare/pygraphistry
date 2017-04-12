import Color from 'color';
import { getHandler, setHandler } from 'viz-app/router';
import { $ref, $value } from '@graphistry/falcor-json-graph';

export function toolbar(path, base) {
    return function toolbar({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);

        return [{
            returns: 'Reference',
            get: getToolbar,
            route: `${base}['toolbar']`
        }, {
            get: getValues,
            set: setValues,
            returns: 'Boolean',
            route: `${base}['toolbars']['beta', 'iFrame', 'static', 'stable'].visible`
        }, {
            returns: '*',
            get: getValues,
            route: `${base}['toolbars']['beta', 'iFrame', 'static', 'stable'].length`
        }, {
            returns: '*',
            get: getValues,
            route: `${base}['toolbars']['beta', 'iFrame', 'static', 'stable'][{integers}]['id', 'name']`
        }, {
            returns: '*',
            get: getValues,
            route: `${base}['toolbars']['beta', 'iFrame', 'static', 'stable'][{integers}].items[{keys}]`
        }];
    }
}

function getToolbar(path) {
    const workbookIds = [].concat(path[1]);
    const viewIds = [].concat(path[3]);
    return workbookIds.reduce((values, workbookId) => {
        return viewIds.reduce((values, viewId) => {
            const basePath = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
            return values.concat($value(
                `${basePath}.toolbar`,
                $ref(`${basePath}.toolbars.stable`)
            ));
        }, values);
    }, []);
}

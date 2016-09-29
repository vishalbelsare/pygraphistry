import {
    ref as $ref,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

import { Observable } from 'rxjs';

import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function layout(path, base) {
    return function layout({ loadViewsById, setLayoutControlById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const setLayoutOptionValues = setHandler(path, loadViewsById,
            (control, key, value, path, { workbook, view }) => Observable.defer(() => {

                control[key] = value;

                const { id, props: { algoName }} = control;

                return setLayoutControlById({
                    workbookId: workbook.id,
                    viewId: view.id,
                    algoName,
                    value,
                    id
                })
                .mapTo({ path, value });
            })
        );

        return [{
            get: getValues,
            route: `${base}['layout']['id', 'name']`
        }, {
            returns: `*`,
            get: getValues,
            route: `${base}['layout'].controls[{keys}]`
        }, {
            returns: `*`,
            get: getValues,
            set: setValues,
            route: `${base}['layout'].controls[{keys}][{keys}]`
        }, {
            get: getValues,
            route: `${base}['layout'].settings[{keys}]`
        }, {
            get: getValues,
            route: `${base}['layout'].options[{keys}]`
        }, {
            get: getValues,
            route: `${base}['layout'].options[{keys}][{keys}]`
        }, {
            set: setLayoutOptionValues,
            route: `${base}['layout'].options[{keys}].value`
        }];
    }
}

/*

    function sceneControlSetHandler(json) {
        const { server, request: { query: options = {}}} = this;
        const { workbookIds, viewIds, settingIds, controlIds } = getIDsFromJSON(json);
        return loadControls({
            workbooksById, workbookIds, viewIds, settingIds, controlIds, server, options
        })
        .mergeMap(({ workbook, view, settingId, controlId }) => {

            const values = [];
            const controlJSON = json
                .workbooksById[workbook.id]
                .viewsById[view.id]
                .scene
                .settingsById[settingId]
                .controlsById[controlId];

            const isSetingParam = 'value' in controlJSON;

            if (isSetingParam) {

                const control = view.scene
                    .settingsById[settingId]
                    .controlsById[controlId];

                values.push($pathValue(`
                    workbooksById['${workbook.id}']
                        .viewsById['${view.id}']
                        .scene
                        .settingsById['${settingId}']
                        .controlsById['${controlId}']
                        .value`,
                    $atom(control.value = controlJSON.value)
                ));

                const { algoName } = control.props;
                view.graph.interactions.next({
                    play: true, layout: true, simControls: {
                        [algoName]: { [controlId]: control.value }
                    }
                });
            }

            return values;
        })
        .map(mapObjectsToAtoms)
        .catch(captureErrorStacks);
    }
*/

import {
    ref as $ref,
    pathValue as $value
} from '@graphistry/falcor-json-graph';
import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function layout(path, base) {
    return function layout({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const setLayoutOptionValues = setHandler(path, loadViewsById, {}, (value, path, { view }) => {
            const { nBody } = view;
            if (nBody) {
                const { layout: { options }} = view;
                const control = options[path[path.length - 2]];
                const { id, props } = control;
                const { algoName } = props;
                nBody.interactions.next({
                    play: true, layout: true, simControls: {
                        [algoName]: {
                            [id]: value
                        }
                    }
                });
            }
            return value;
        });

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

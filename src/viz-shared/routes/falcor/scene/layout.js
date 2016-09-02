import {
    ref as $ref,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';
import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function layout(path, base) {
    return function layout({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById, {}, (value, path, { view }) => {
            const { nBody } = view;
            if (nBody) {
                const { scene: { layout: { options }}} = view;
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
            route: `${base}['layout'][{keys}]`
        }, {
            get: getValues,
            route: `${base}['layout']['options', 'settings'][{keys}]`
        }, {
            get: getValues,
            route: `${base}['layout']['options'][{keys}][{keys}]`
        }, {
            set: setValues,
            route: `${base}['layout']['options'][{keys}].value`
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

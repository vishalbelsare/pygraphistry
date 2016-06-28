import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue
} from 'falcor-json-graph';
import Color from 'color';
import { getHandler,
         getIDsFromJSON,
         mapObjectsToAtoms,
         captureErrorStacks } from '../support';

export function controls({ loadViewsById }, routesSharedState) {

    const genericGetHandler = getHandler(['workbook', 'view'], loadViewsById, routesSharedState);

    return [{
        get: genericGetHandler,
        route: `workbooksById[{keys}]
                    .viewsById[{keys}]
                    .settingsById[{keys}]
                    .controls[{keys}]`
    }, {
        get: genericGetHandler,
        route: `workbooksById[{keys}]
                    .viewsById[{keys}]
                    .settingsById[{keys}]
                    .controlsById[{keys}]`
    }, {
        get: genericGetHandler,
        set: setViewControlKeysHandler,
        route: `workbooksById[{keys}]
                    .viewsById[{keys}]
                    .settingsById[{keys}]
                    .controlsById
                    [{keys}][{keys}]`
    }, {
        get: genericGetHandler,
        route: `workbooksById[{keys}]
                    .viewsById[{keys}]
                    .scene
                    .settingsById[{keys}]
                    .controls[{keys}]`
    }, {
        get: genericGetHandler,
        route: `workbooksById[{keys}]
                    .viewsById[{keys}]
                    .scene
                    .settingsById[{keys}]
                    .controlsById[{keys}]`
    }, {
        get: genericGetHandler,
        set: setSceneControlKeysHandler,
        route: `workbooksById[{keys}]
                    .viewsById[{keys}]
                    .scene
                    .settingsById[{keys}]
                    .controlsById
                    [{keys}][{keys}]`
    }];

    function loadControls({
        workbookIds, viewIds, settingIds, controlIds, options
    }) {
        return loadViewsById({
            ...routesSharedState, workbookIds, viewIds, options
        })
        .mergeMap(
            ({ workbook, view }) => settingIds,
            ({ workbook, view }, settingId) => ({ workbook, view, settingId })
        )
        .mergeMap(
            ({ workbook, view, settingId }) => controlIds,
            ({ workbook, view, settingId }, controlId) => ({ workbook, view, settingId, controlId })
        );
    }

    function setViewControlKeysHandler(json) {

        const { request: { query: options = {}}} = this;
        const { workbookIds, viewIds, settingIds, controlIds } = getIDsFromJSON(json);

        return loadControls({
            ...routesSharedState, workbookIds, viewIds, settingIds, controlIds, options
        })
        .mergeMap(({ workbook, view, settingId, controlId }) => {

            const values = [];
            const controlJSON = json
                .workbooksById[workbook.id]
                .viewsById[view.id]
                .settingsById[settingId]
                .controlsById[controlId];

            const isSetingParam = 'value' in controlJSON;

            if (isSetingParam) {

                const control = view
                    .settingsById[settingId]
                    .controlsById[controlId];

                values.push($pathValue(`
                    workbooksById['${workbook.id}']
                        .viewsById['${view.id}']
                        .settingsById['${settingId}']
                        .controlsById['${controlId}']
                        .value`,
                    $atom(control.value = controlJSON.value)
                ));
            }

            return values;
        })
        .map(mapObjectsToAtoms)
        .catch(captureErrorStacks);
    }

    function setSceneControlKeysHandler(json) {

        const { request: { query: options = {}}} = this;
        const { workbookIds, viewIds, settingIds, controlIds } = getIDsFromJSON(json);

        return loadControls({
            ...routesSharedState, workbookIds, viewIds, settingIds, controlIds, options
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

                const { graph } = view;

                if (graph && graph.interactions) {
                    const { algoName } = control.props;
                    graph.interactions.next({
                        play: true, layout: true, simControls: {
                            [algoName]: {
                                [controlId]: control.value
                            }
                        }
                    });
                }
            }

            return values;
        })
        .map(mapObjectsToAtoms)
        .catch(captureErrorStacks);
    }

}

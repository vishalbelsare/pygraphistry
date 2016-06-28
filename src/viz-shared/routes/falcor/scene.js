import {
    ref as $ref,
    pathValue as $pathValue
} from 'falcor-json-graph';
import { getHandler,
         getIDsFromJSON,
         mapObjectsToAtoms,
         captureErrorStacks } from '../support';

export function scene({ loadViewsById }, props) {

    const genericGetHandler = getHandler(['workbook', 'view'], loadViewsById, props);

    return [{
        get: genericGetHandler,
        route: `workbooksById[{keys}]
                    .viewsById[{keys}]
                    .scene[
                        'buffers', 'textures', 'targets', 'triggers',
                        'programs', 'uniforms', 'items', 'modes', 'models', 'render',
                        'arcHeight', 'numRenderedSplits', 'clientMidEdgeInterpolation'
                    ]`
    }, {
        get: genericGetHandler,
        route: `workbooksById[{keys}]
                    .viewsById[{keys}]
                    .scene[
                        'camera', 'server', 'options',
                        'settings', 'settingsById'
                    ][{keys}]`
    }, {
        get: genericGetHandler,
        route: `workbooksById[{keys}]
                    .viewsById[{keys}]
                    .scene['camera', 'settingsById']
                    [{keys}][{keys}]`
    }, {
        set: setCameraKeys1Handler,
        route: `workbooksById[{keys}]
                    .viewsById[{keys}]
                    .scene.camera
                    [{keys}]`
    }, {
        set: setCameraKeys2Handler,
        route: `workbooksById[{keys}]
                    .viewsById[{keys}]
                    .scene.camera
                    [{keys}][{keys}]`
    }];

    function setCameraKeys1Handler(json) {

        const { viewIds, workbookIds } = getIDsFromJSON(json);
        const { request: { query: options = {}}} = this;

        return loadViewsById({
            workbookIds, viewIds, options
        })
        .mergeMap(({ workbook, view }) => {

            const values = [];
            const { scene: { camera }} = view;
            const cameraJSON = json
                .workbooksById[workbook.id]
                .viewsById[view.id]
                .scene.camera;

            for (const key in cameraJSON) {
                values.push($pathValue(`
                    workbooksById['${workbook.id}']
                        .viewsById['${view.id}']
                        .scene.camera['${key}']`,
                    camera[key] = cameraJSON[key]
                ));
            }

            return values;
        })
        .map(mapObjectsToAtoms)
        .catch(captureErrorStacks);
    }

    function setCameraKeys2Handler(json) {

        const { viewIds, workbookIds } = getIDsFromJSON(json);
        const { request: { query: options = {}}} = this;

        return loadViewsById({
            workbookIds, viewIds, options
        })
        .mergeMap(({ workbook, view }) => {

            const values = [];
            const { scene: { camera }} = view;
            const cameraJSON = json
                .workbooksById[workbook.id]
                .viewsById[view.id]
                .scene.camera;

            for (const key1 in cameraJSON) {
                const json2 = cameraJSON[key1];
                for (const key2 in json2) {
                    values.push($pathValue(`
                        workbooksById['${workbook.id}']
                            .viewsById['${view.id}']
                            .scene.camera['${key1}']['${key2}']`,
                       camera[key1][key2] = json2[key2]
                    ));
                }
            }

            return values;
        })
        .map(mapObjectsToAtoms)
        .catch(captureErrorStacks);
    }
}

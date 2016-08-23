import {
    ref as $ref,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';
import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function camera(path, base) {
    return function camera({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);

        return [{
            get: getValues,
            set: setValues,
            route: `${base}['camera'][{keys}]`,
            returns: `*`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['camera'][{keys}][{keys}]`,
            returns: `*`
        }, {
            get: getValues,
            route: `${base}['camera']['controls', 'options'][{keys}]`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['camera']['controls', 'options'][{keys}][{keys}]`
        }]

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
                    values.push($value(`
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
                        values.push($value(`
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
}


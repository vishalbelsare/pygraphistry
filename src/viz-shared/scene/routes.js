import {
    ref as $ref,
    pathValue as $pathValue
} from 'reaxtor-falcor-json-graph';
import { getHandler,
         getIDsFromJSON,
         mapObjectsToAtoms,
         captureErrorStacks } from '../routes';

export function scene(path, route) {
    return function scene({ loadViewsById, loadLabelsByIndexAndType }) {

        const getValues = getHandler(path, loadViewsById);

        return [{
            get: getValues,
            route: `${route}.scene[
                'buffers', 'textures', 'targets', 'triggers', 'selection',
                'programs', 'uniforms', 'items', 'modes', 'models', 'render',
                'arcHeight', 'numRenderedSplits', 'clientMidEdgeInterpolation',
                'highlight'
            ]`,
            returns: `*`
        }, {
            get: getValues,
            route: `${route}.scene['hints', 'camera', 'server', 'options'][{keys}]`,
            returns: `*`
        }, {
            get: getValues,
            route: `${route}.scene['camera'][{keys}][{keys}]`,
            returns: `*`
        }, {
            set: setCameraKeys1Handler,
            route: `${route}.scene.camera[{keys}]`,
            returns: `*`
        }, {
            set: setCameraKeys2Handler,
            route: `${route}.scene.camera[{keys}][{keys}]`,
            returns: `*`
        }, {
            get: getValues,
            route: `${route}.scene.labels.length`,
            returns: `Number`
        }, {
            get: getValues,
            route: `${route}.scene.labels[{integers}]`,
            returns: `$ref('workbooksById[{workbookId}].viewsById[{viewId}].scene.labelsById[{labelId}]')`
        }, {
            get: getLabelsByRangeAndTypeHandler,
            route: `${route}.scene.labelsById[{ranges}]['edge', 'point']`,
            returns: `{ title, columns }`
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

        function getLabelsByRangeAndTypeHandler(path) {

            const { workbookIds, viewIds } = path;
            const labelTypes = [].concat(path[7]);
            const labelRanges = [].concat(path[6]);
            const { request: { query: options = {}}} = this;

            const labelIndexes = labelRanges.reduce((indexes, { from: index, to }) => {
                while (index <= to) {
                    indexes[indexes.length] = index++;
                }
                return indexes;
            }, []);

            return loadLabelsByIndexAndType({
                workbookIds, viewIds, labelTypes, labelIndexes, options
            })
            .map(({ workbook, view, label }) => {
                const { labels } = view;
                const { data, type, index } = label;
                const labelById = labels[index] || (labels[index] = {});
                return $pathValue(`
                        workbooksById['${workbook.id}']
                            .viewsById['${view.id}']
                            .scene.labelsById[${index}]['${type}']`,
                    $atom(labelById[type] = data)
                );
            })
            .map(mapObjectsToAtoms)
            .catch(captureErrorStacks);
        }
    }
}

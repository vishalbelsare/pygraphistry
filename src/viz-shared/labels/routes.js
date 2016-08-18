import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue
} from 'reaxtor-falcor-json-graph';
import Color from 'color';
import { getHandler,
         getIDsFromJSON,
         mapObjectsToAtoms,
         captureErrorStacks } from '../routes';

export function labels(path, route) {
    return function labels({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);

        return [{
            get: getValues,
            set: setLabelKeysHandler,
            route: `${route}.labels[{keys}]`,
            returns: `*`
        }, {
            get: getValues,
            set: setLabelColorsHandler,
            route: `${route}.labels['background', 'foreground'].color`,
            returns: `Color<hsv>`
        }];

        function setLabelKeysHandler(json) {

            const { viewIds, workbookIds } = getIDsFromJSON(json);
            const { request: { query: options = {}}} = this;

            return loadViewsById({
                workbookIds, viewIds, options
            })
            .mergeMap(({ workbook, view }) => {

                const values = [];
                const { labels } = view;
                const labelsJSON = json
                    .workbooksById[workbook.id]
                    .viewsById[view.id]
                    .labels;

                for (const key in labelsJSON) {
                    values.push($pathValue(`
                        workbooksById['${workbook.id}']
                            .viewsById['${view.id}']
                            .labels['${key}']`,
                        labels[key] = labelsJSON[key]
                    ));
                }

                return values;
            })
            .map(mapObjectsToAtoms)
            .catch(captureErrorStacks);
        }

        function setLabelColorsHandler(json) {

            const { viewIds, workbookIds } = getIDsFromJSON(json);
            const { request: { query: options = {}}} = this;

            return loadViewsById({
                workbookIds, viewIds, options
            })
            .mergeMap(({ workbook, view }) => {

                const values = [];
                const { labels } = view;
                const labelsJSON = json
                    .workbooksById[workbook.id]
                    .viewsById[view.id]
                    .labels;

                for (const colorType in labelsJSON) {

                    const color = labels[colorType].color =
                        new Color(labelsJSON[colorType].color);

                    values.push($pathValue(`
                        workbooksById['${workbook.id}']
                            .viewsById['${view.id}']
                            .labels['${colorType}']
                            .color`,
                        color.hsv()
                    ));
                }

                return values;
            })
            .map(mapObjectsToAtoms)
            .catch(captureErrorStacks);
        }
    }
}

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

export function labels({ loadViewsById, loadLabelsByIndexAndType }) {

    const genericGetHandler = getHandler(['workbook', 'view'], loadViewsById);

    return [{
        get: getLabelsByRangeAndTypeHandler,
        route: `workbooksById[{keys: workbookIds}]
                    .viewsById[{keys: viewIds}]
                    .labels[{ranges}][
                        'edge', 'point'
                    ]`,
        returns: `{ type, columns }`
    }, {
        get: genericGetHandler,
        set: setLabelKeysHandler,
        route: `workbooksById[{keys}]
                    .viewsById[{keys}]
                    .labels[{keys}]`,
        returns: `*`
    }, {
        get: genericGetHandler,
        set: setLabelColorsHandler,
        route: `workbooksById[{keys}]
                    .viewsById[{keys}]
                    .labels['background', 'foreground']
                    .color`,
        returns: `Color<hsv>`
    }];

    function getLabelsByRangeAndTypeHandler(path) {

        const { workbookIds, viewIds } = path;
        const labelTypes = [].concat(path[6]);
        const labelRanges = [].concat(path[5]);
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
                        .labels[${index}]['${type}']`,
                $atom(labelById[type] = data)
            );
        })
        .map(mapObjectsToAtoms)
        .catch(captureErrorStacks);
    }

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

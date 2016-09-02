import Color from 'color';

import {
    ref as $ref,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';

import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function labels(path, base) {
    return function labels({ loadViewsById, loadLabelsByIndexAndType }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const setColors = setHandler(path, loadViewsById,
            { color: true },
            ( color, path, context) => new Color(color)
        );

        return [{
            get: getValues,
            set: setValues,
            route: `${base}['labels'][{keys}]`
        }, {
            get: getValues,
            route: `${base}['labels']['edge', 'point'][{keys}]`
        }, {
            get: getValues,
            set: setColors,
            route: `${base}['labels']['background', 'foreground'][{keys}]`
        }, {
            get: getLabelsByTypeAndRangeHandler,
            route: `${base}['labelsByType']['edge', 'point'][{ranges}]`
        }, {
            get: getValues,
            route: `${base}['labels']['options', 'settings'][{keys}]`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['labels']['options'][{keys}][{keys}]`
        }]

        function getLabelsByTypeAndRangeHandler(path) {

            const { workbookIds, viewIds } = path;
            const labelTypes = [].concat(path[path.length - 2]);
            const labelRanges = [].concat(path[path.length - 1]);
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
                const { labelsByType } = view.scene;
                const { data, type, index } = label;
                const labelByType = labelsByType[type] || (labelsByType[type] = []);
                return $value(`
                        workbooksById['${workbook.id}']
                            .viewsById['${view.id}']
                            .scene.labelsByType['${type}'][${index}]`,
                    $atom(labelByType[index] = data)
                );
            })
            .map(mapObjectsToAtoms)
            .catch(captureErrorStacks);
        }
    }
}


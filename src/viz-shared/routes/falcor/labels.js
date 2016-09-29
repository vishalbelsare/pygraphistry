import Color from 'color';
import { Observable } from 'rxjs';

import {
    ref as $ref,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function labels(path, base) {
    return function labels({ loadViewsById, loadLabelsByIndexAndType }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const setColors = setHandler(path, loadViewsById,
            (node, key, color, path, data) => Observable.of({
                path, value: node[key] = new Color(color)
            }),
            { color: true }
        );

        return [{
            get: getValues,
            set: setValues,
            route: `${base}['labels'][
                'id',  'name',  'opacity',  'enabled',
                'timeZone', 'selection', 'poiEnabled'
            ]`
        }, {
            get: getValues,
            route: `${base}['labels']['edges', 'points'][{keys}]`
        }, {
            get: getValues,
            set: setColors,
            route: `${base}['labels']['background', 'foreground'][{keys}]`
        }, {
            returns: `*`,
            get: getValues,
            route: `${base}['labels'].controls[{keys}]`
        }, {
            returns: `*`,
            get: getValues,
            set: setValues,
            route: `${base}['labels'].controls[{keys}][{keys}]`
        }, {
            get: getValues,
            route: `${base}['labels'].settings[{keys}]`
        }, {
            get: getValues,
            route: `${base}['labels'].options[{keys}]`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['labels'].options[{keys}][{keys}]`
        }, {
            get: getLabelsByTypeAndRangeHandler,
            route: `${base}['labelsByType']['edge', 'point'][{ranges}]`
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


import sanitizeHTML from 'sanitize-html';
import { Observable } from 'rxjs/Observable';
import { getHandler, setHandler } from 'viz-shared/routes';
import { $ref, $value, $invalidate } from '@graphistry/falcor-json-graph';

export function inspector(path, base) {
    return function inspector({ loadViewsById, filterRowsByQuery, loadRowsByIndexAndType }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);

        return [{
            returns: `*`,
            get: getValues,
            set: setValues,
            route: `${base}['inspector']['open', 'openTab', 'length', 'id', 'name', 'templates', 'currentQuery']`,
        }, {
            get: getValues,
            route: `${base}['inspector'].controls[{keys}]`
        }, {
            returns: `*`,
            get: getValues,
            set: setValues,
            route: `${base}['inspector'].queries[{keys}][{keys}]`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['inspector'].controls[{keys}][{keys}]`
        }, {
            get: getRowsByTypeAndIndex,
            route: `${base}['componentsByType']['point', 'edge'].rows[{integers}][{keys: columnNames}]`
        }, {
            get: getRowLengthOrValueRefsByQuery,
            route: `${base}['inspector'].rows['point', 'edge'].length`
        }, {
            get: getRowLengthOrValueRefsByQuery,
            route: `${base}['inspector'].rows['point', 'edge'][{integers}]`
        }, {
            get: getRowLengthOrValueRefsByQuery,
            route: `${base}['inspector'].rows['point', 'edge'][{keys: sortKeys}].length`
        }, {
            get: getRowLengthOrValueRefsByQuery,
            route: `${base}['inspector'].rows['point', 'edge'][{keys: sortKeys}][{integers}]`
        }, {
            get: getRowLengthOrValueRefsByQuery,
            route: `${base}['inspector'].rows['point', 'edge'][{keys: sortKeys}][{keys: sortOrders}].length`
        }, {
            get: getRowLengthOrValueRefsByQuery,
            route: `${base}['inspector'].rows['point', 'edge'][{keys: sortKeys}][{keys: sortOrders}][{integers}]`
        }, {
            get: getRowLengthOrValueRefsByQuery,
            route: `${base}['inspector'].rows['point', 'edge'][{keys: sortKeys}][{keys: sortOrders}][{keys: searchTerms}].length`
        }, {
            get: getRowLengthOrValueRefsByQuery,
            route: `${base}['inspector'].rows['point', 'edge'][{keys: sortKeys}][{keys: sortOrders}][{keys: searchTerms}][{integers}]`
        }];

        function getRowsByTypeAndIndex(rowsPath) {

            const componentTypes = [].concat(rowsPath[rowsPath.length - 4]);

            const getRowsByIndexAndTypeHandler = getHandler(path, (context) => loadRowsByIndexAndType({
                ...context, componentTypes
            }));

            return getRowsByIndexAndTypeHandler.call(this, rowsPath).map(({ path, value }) => {
                if (typeof value === 'string') {
                    value = sanitizeHTML(decodeURIComponent(value));
                }
                return { path, value };
            });
        }

        function getRowLengthOrValueRefsByQuery(rowsPath) {

            const { sortKeys, sortOrders, searchTerms } = rowsPath;
            const componentTypes = [].concat(rowsPath[rowsPath.length -
                Number(Boolean(searchTerms)) -
                Number(Boolean(sortOrders)) -
                Number(Boolean(sortKeys)) -
                2
            ]);

            const getRowValuesHandler = getHandler(path, (context) => filterRowsByQuery({
                ...context, componentTypes, searchTerms, sortKeys, sortOrders
            }));

            return getRowValuesHandler.call(this, rowsPath).map(({ path, value }) => {
                if (path[path.length - 1] !== 'length') {
                    const rowsKeyIndex = path.indexOf('rows');
                    const componentType = path[rowsKeyIndex + 1];
                    const basePath = path.slice(0, rowsKeyIndex - 1);
                    value = $ref(basePath.concat('componentsByType', componentType, 'rows', value._selectionIndex));
                }
                return { path, value };
            });
        }
    }
}

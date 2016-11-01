import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import { Subject, Observable } from 'rxjs';

import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function expressions(path, base) {
    return function expressions({ loadViewsById, maskDataframe, updateExpressionById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);

        const batchSetValues = ({ viewId, workbookId, expressionId, path, values }) => (
            Observable
                .from(Object.keys(values))
                .mergeMap(
                    (key) => updateExpressionById({
                        key, value: values[key],
                        viewId, workbookId, expressionId,
                    }),
                    (key, { view, workbook, expression }) => ({
                        path: path.concat(key),
                        value: expression[key],
                        view, workbook, expression
                    })
                )
                .reduce(
                    ({ values }, { view, workbook, path, value }) => ({
                        view, workbook, values: [...values, {path, value}]
                    }),
                    { values: [] }
                )
        );

        function updateExpressionAndMaskDataframe(path, [values]) {
            path = path.slice(0, -1);
            const expressionId = path[path.length - 1];
            const workbookId = path[1];
            const viewId = path[3];
            return batchSetValues({
                path, values, viewId, workbookId, expressionId
            })
            .filter(({ values }) => values.length > 0)
            .mergeMap(
                ({ view }) => maskDataframe({ view })
                    // ignore dataframe errors
                    .catch((err) => Observable.of(0)),
                ({ view, workbook, values }) => {
                    const { histograms = [] } = view;
                    const length = histograms.length;
                    if (length > 0) {
                        // If the view has histograms, invalidate the
                        // relevant fields so they're recomputed if the
                        // histograms panel is open, or the next time the
                        // panel is opened.
                        values = values.concat($invalidate(`
                            workbooksById['${workbook.id}']
                                .viewsById['${view.id}']
                                .histograms[0...${length}]
                                .masked['bins', 'isMasked']`
                        ));
                    }
                    return values;
                }
            )
            .mergeMap((values) => values);
        }

        return [{
            get: getValues,
            route: `${base}['expressionsById'][{keys}]`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['expressionsById'][{keys}][{keys}]`
        }, {
            call: updateExpressionAndMaskDataframe,
            route: `${base}['expressionsById'][{keys}]['update']`
        }];
    }
}

export function addExpressionHandler({
    addItem,
    mapName = 'expressionsById',
    listName = 'expressions',
    itemName = 'expression',
    ...restProps
}) {
    return function addExpressionHandler(path, [componentType, name, dataType]) {
        const workbookIds = [].concat(path[1]);
        const viewIds = [].concat(path[3]);
        return addItem({
            workbookIds, viewIds, name, dataType, componentType, ...restProps
        })
        .mergeMap(({ workbook, view, [itemName]: value }) => {

            const base = `workbooksById['${workbook.id}'].viewsById['${view.id}']`;

            const { [listName]: list } = view;
            const newLengthPath = `${base}['${listName}'].length`;
            const newItemPath = `${base}['${listName}'][${list.length}]`;
            const newItemRef = $ref(`${base}['${mapName}']['${value.id}']`);

            list[list.length++] = newItemRef;

            return [
                $value(newItemPath, newItemRef),
                $value(newLengthPath, list.length),
            ];
        })
        .catch(captureErrorStacks)
        .catch((err) => {

            if (!err.workbook) {
                return Observable.throw(err);
            }

            const { workbook, view, errors } = err;
            const base = `workbooksById['${workbook.id}'].viewsById['${view.id}']`;

            const { [listName]: list } = view;
            const newLengthPath = `${base}['${listName}'].length`;
            const newItemPath = `${base}['${listName}'][${list.length}]`;
            return [
                $value(newItemPath, $error(errors)),
                $value(newLengthPath, list.length++),
            ];
        })
        .map(mapObjectsToAtoms);
    }
}

export function removeExpressionHandler({
    removeItem,
    listName = 'expressions',
    itemIDName = 'expressionId',
    ...restProps
}) {
    return function removeExpressionHandler(path, [itemId]) {
        const workbookIds = [].concat(path[1]);
        const viewIds = [].concat(path[3]);
        return removeItem({
            workbookIds, viewIds, [itemIDName]: itemId, ...restProps
        })
        .mergeMap(({ workbook, view }) => {

            const { [listName]: list } = view;
            const base = `workbooksById['${workbook.id}'].viewsById['${view.id}']`;

            const listRefVals = [];
            let listLen = list.length;
            let index = -1, found = false;

            while (++index < listLen) {
                if (found) {
                    listRefVals.push($value(
                        `${base}['${listName}'][${index - 1}]`,
                        list[index - 1] = list[index]
                    ));
                    continue;
                }
                let itemRef = list[index], itemRefPath;
                if (itemRef && (itemRefPath = itemRef.value)) {
                    const itemRefId = itemRefPath[itemRefPath.length - 1];
                    if (itemRefId === itemId) {
                        found = true;
                    }
                }
            }

            const newLengthPath = `${base}['${listName}'].length`;

            return listRefVals.concat(
                $value(newLengthPath, list.length -= Number(found))
            );
        })
        .catch(captureErrorStacks)
        .map(mapObjectsToAtoms);
    }
}

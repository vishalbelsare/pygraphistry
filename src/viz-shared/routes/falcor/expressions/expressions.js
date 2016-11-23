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
                    ({ values }, { view, workbook, expression, path, value }) => ({
                        view, workbook, expression, values: [...values, {path, value}]
                    }),
                    { values: [] }
                )
        );

        function updateExpressionAndMaskDataframe(path, [expressionProps]) {
            path = path.slice(0, -1);
            const expressionId = path[path.length - 1];
            const workbookId = path[1];
            const viewId = path[3];
            return batchSetValues({
                path, values: expressionProps,
                viewId, workbookId, expressionId
            })
            .filter(({ values }) => values.length > 0)
            .mergeMap(
                ({ view }) => maskDataframe({ view })
                    // ignore dataframe errors
                    .catch((err) => Observable.of(0)),
                ({ view, workbook, expression, values }) => {
                    const { histograms = [] } = view;
                    const length = histograms.length;
                    if (length > 0 && (
                        expression.enabled === true ||
                        ('enabled' in expressionProps))) {

                        // If the view has histograms, invalidate the
                        // relevant fields so they're recomputed if the
                        // histograms panel is open, or the next time the
                        // panel is opened.
                        const viewPath = `
                                workbooksById['${workbook.id}']
                                    .viewsById['${view.id}']`;

                        values.push(
                            $invalidate(`${viewPath}.labelsByType`),
                            $invalidate(`${viewPath}.inspector.rows`),
                            $invalidate(`${viewPath}.selection.histogramsById`)
                        );
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
    panelSide = 'left',
    openPanel = false,
    ...restProps
}) {
    return function addExpressionHandler(path, [item]) {

        const viewIds = [].concat(path[3]);
        const workbookIds = [].concat(path[1]);

        return addItem({
            workbookIds, viewIds, [itemName]: item, ...restProps
        })
        .mergeMap(({ workbook, view, [itemName]: value }) => {

            const viewPath = `
                workbooksById['${workbook.id}']
                    .viewsById['${view.id}']`;

            const { [listName]: list } = view;
            const newLengthPath = `${viewPath}['${listName}'].length`;
            const newItemPath = `${viewPath}['${listName}'][${list.length}]`;
            const newItemRef = $ref(`${viewPath}['${mapName}']['${value.id}']`);

            list[list.length++] = newItemRef;

            const pathValues = [
                $invalidate(`${viewPath}.labelsByType`),
                $invalidate(`${viewPath}.inspector.rows`),
                $invalidate(`${viewPath}.selection.histogramsById`),

                $value(newItemPath, newItemRef),
                $value(newLengthPath, list.length),
                $value(`${viewPath}.highlight.darken`, false),
            ];

            if (openPanel) {
                pathValues.push(
                    $value(`${viewPath}.scene.controls[1].selected`, false),
                    $value(`${viewPath}.labels.controls[0].selected`, false),
                    $value(`${viewPath}.layout.controls[0].selected`, false),
                    $value(`${viewPath}.filters.controls[0].selected`, false),
                    $value(`${viewPath}.exclusions.controls[0].selected`, false),
                    $value(`${viewPath}.histograms.controls[0].selected`, false),
                    $value(`${viewPath}['${listName}'].controls[0].selected`, true),
                    $value(`${viewPath}.panels['${panelSide}']`, $ref(`${viewPath}['${listName}']`))
                );
            }

            return pathValues;
        })
        .catch(captureErrorStacks)
        .catch((err) => {

            if (!err.workbook) {
                return Observable.throw(err);
            }

            const { workbook, view, errors } = err;
            const viewPath = `workbooksById['${workbook.id}'].viewsById['${view.id}']`;

            const { [listName]: list } = view;
            const newLengthPath = `${viewPath}['${listName}'].length`;
            const newItemPath = `${viewPath}['${listName}'][${list.length}]`;
            return [
                $value(newItemPath, $error(errors)),
                $value(newLengthPath, list.length++),
            ];
        });
    }
}

export function removeExpressionHandler({
    removeItem,
    mapName = 'expressionsById',
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
            const viewPath = `
                workbooksById['${workbook.id}']
                    .viewsById['${view.id}']`;

            const listRefVals = [];
            let listLen = list.length;
            let index = -1, found = false;

            while (++index < listLen) {
                if (found) {
                    listRefVals.push($value(
                        `${viewPath}['${listName}'][${index - 1}]`,
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

            if (found) {
                listRefVals.push(

                    $invalidate(`${viewPath}.labelsByType`),
                    $invalidate(`${viewPath}.inspector.rows`),
                    $invalidate(`${viewPath}.selection.histogramsById`),
                    $invalidate(`${viewPath}['${mapName}']['${itemId}']`),

                    $value(`${viewPath}.highlight.darken`, false),
                    $value(`${viewPath}['${listName}'].length`, list.length -= 1)
                );
            }

            return listRefVals;
        });
    }
}

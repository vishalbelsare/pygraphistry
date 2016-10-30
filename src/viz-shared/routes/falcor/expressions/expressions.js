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
        const setExpressionValues = setHandler(path, loadViewsById,
            (expression, key, value, path, { workbook, view }) => {
                const expressionId = path[path.length - 2];
                return updateExpressionById({
                    workbookId: workbook.id,
                    viewId: view.id,
                    expressionId,
                    value,
                    key
                })
                .map(({ view, expression }) => ({
                    view, expression, path, value: expression[key]
                }))
            }
        );

        function batchSetExpressionValuesAndMaskDataframe(json) {
            return setExpressionValues
                .call(this, json)
                .reduce(
                    ({ values }, { view, path, value }) => {
                        values.push({ path, value });
                        return { view, values };
                    },
                    { values: [] }
                )
                .mergeMap(({ view, values }) =>
                    maskDataframe({ view })
                        .mergeMapTo(values)
                        // ignore errors
                        .catch((err) => Observable.from(values))
                )
                .catch(captureErrorStacks)
                .map(mapObjectsToAtoms);
        }

        return [{
            returns: `*`,
            get: getValues,
            route: `${base}['expressionTemplates'][{keys}]`,
        }, {
            returns: `*`,
            get: getValues,
            route: `${base}['expressionTemplates'][{keys}][{keys}]`,
        }, {
            get: getValues,
            route: `${base}['expressionsById'][{keys}]`
        }, {
            get: getValues,
            set: batchSetExpressionValuesAndMaskDataframe,
            route: `${base}['expressionsById'][{keys}][{keys}]`
        }];
    }
}

export function addExpressionHandler({
    addExpression,
    expressionType = 'filter'
}) {
    return function addExpressionHandler(path, [componentType, name, dataType]) {
        const workbookIds = [].concat(path[1]);
        const viewIds = [].concat(path[3]);
        return addExpression({
            workbookIds, viewIds, name, dataType, componentType, expressionType
        })
        .mergeMap(({ workbook, view, expression }) => {

            const list = expressionType + 's';
            const base = `workbooksById['${workbook.id}'].viewsById['${view.id}']`;

            const { [list]: exprs } = view;
            const newLengthPath = `${base}['${list}'].length`;
            const newFilterPath = `${base}['${list}'][${exprs.length}]`;
            const expressionRef = $ref(`${base}['expressionsById']['${expression.id}']`);

            exprs[exprs.length++] = expressionRef;

            return [
                $value(newLengthPath, exprs.length),
                $value(newFilterPath, expressionRef),
            ];
        })
        .catch(captureErrorStacks)
        .catch((err) => {

            if (!err.workbook) {
                return Observable.throw(err);
            }

            const { workbook, view, errors } = err;
            const list = expressionType + 's';
            const base = `workbooksById['${workbook.id}'].viewsById['${view.id}']`;

            const { [list]: exprs } = view;
            const newLengthPath = `${base}['${list}'].length`;
            const newFilterPath = `${base}['${list}'][${exprs.length}]`;
            return [
                $value(newLengthPath, exprs.length++),
                $value(newFilterPath, $error(errors)),
            ];
        })
        .map(mapObjectsToAtoms);
    }
}

export function removeExpressionHandler({
    removeExpressionById,
    expressionType = 'filter'
}) {
    return function removeExpressionHandler(path, [expressionId]) {
        const workbookIds = [].concat(path[1]);
        const viewIds = [].concat(path[3]);
        return removeExpressionById({
            workbookIds, viewIds, expressionId
        })
        .mergeMap(({ workbook, view }) => {

            const list = expressionType + 's';
            const base = `workbooksById['${workbook.id}'].viewsById['${view.id}']`;

            const { [list]: exprs } = view;

            const exprRefVals = [];
            let exprsLen = exprs.length;
            let index = -1, found = false;

            while (++index < exprsLen) {
                if (found) {
                    exprRefVals.push($value(
                        `${base}['${list}'][${index - 1}]`,
                        exprs[index - 1] = exprs[index]
                    ));
                    continue;
                }
                const exprRef = exprs[index].value;
                const exprRefId = exprRef[exprRef.length - 1];
                if (exprRefId === expressionId) {
                    found = true;
                }
            }

            const newLengthPath = `${base}['${list}'].length`;

            return [
                ...exprRefVals,
                $value(newLengthPath, exprs.length -= Number(found))
            ];
        })
        .catch(captureErrorStacks)
        .map(mapObjectsToAtoms);
    }
}

import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function expressions(path, base) {
    return function expressions({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);

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
            set: setValues,
            route: `${base}['expressionsById'][{keys}][{keys}]`
        }];
    }
}

export function addExpressionHandler({
    loadViewsById, addExpression,
    expressionType: type = 'filter' }) {

    return function addExpressionHandler(path, [name, dataType, attribute]) {
        const workbookIds = [].concat(path[1]);
        const viewIds = [].concat(path[3]);
        return loadViewsById({
            workbookIds, viewIds
        })
        .mergeMap(
            ({ workbook, view }) => addExpression({
                view, name, dataType, attribute, type
            })
            .catch((errors) => Observable.throw({
                workbook, view, errors
            })),
            ({ workbook, view }, { expression }) => ({
                workbook, view, expression
            })
        )
        .mergeMap(({ workbook, view, expression }) => {

            const list = type + 's';
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
            const list = type + 's';
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

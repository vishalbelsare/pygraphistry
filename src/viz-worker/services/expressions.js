import { Observable } from 'rxjs';
import { maskDataframe } from './dataframe';
import {
    filter as createFilter,
    exclusion as createExclusion,
    expression as createExpression
} from 'viz-shared/models/expressions';

export function addExpression(loadViewsById) {
    return function addExpression({ workbookIds, viewIds, name, dataType, attribute, type = 'filter' }) {
        return loadViewsById({
            workbookIds, viewIds
        })
        .mergeMap(({ workbook, view }) => {
            const { expressionsById } = view;
            const expression = type === 'filter' ?
                createFilter('', name, dataType, attribute) :
                createExclusion('', name, dataType, attribute);
            expressionsById[expression.id] = expression;
            return maskDataframe({ view })
                .catch((errors) => Observable.throw({ workbook, view, errors }))
                .map(({ view }) => ({ workbook, view, expression }));
        });
    }
}

export function updateExpression(loadViewsById) {
    return function updateExpressionById({ workbookId, viewId, expressionId, key, value }) {
        return loadViewsById({
            workbookIds: [workbookId], viewIds: [viewId]
        })
        .map(({ workbook, view }) => {
            const { expressionsById } = view;
            let expression = expressionsById[expressionId];

            if (key === 'input') {
                const { query } = createExpression(value);
                expression = { ...expression, query };
            }

            expression[key] = value;
            expressionsById[expressionId] = expression;

            return { workbook, view, expression };
        });
    }
}

export function removeExpression(loadViewsById) {
    return function removeExpressionById({ workbookIds, viewIds, expressionId }) {
        return loadViewsById({
            workbookIds, viewIds
        })
        .mergeMap(({ workbook, view }) => {
            const { expressionsById } = view;
            if (!expressionsById.hasOwnProperty(expressionId)) {
                return Observable.of({ view, expressionId })
            }
            delete expressionsById[expressionId];
            return maskDataframe({ view })
                .catch((errors) => Observable.throw({ workbook, view, errors }))
                .map(({ view }) => ({ workbook, view, expressionId }));
        });
    }
}

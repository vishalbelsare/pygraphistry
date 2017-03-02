import { Observable } from 'rxjs';
import { maskDataframe } from './dataframe';
import {
    filter as createFilter,
    exclusion as createExclusion,
    expression as createExpression
} from 'viz-app/models/expressions';

export function addExpression(loadViewsById) {
    return function addExpression({ workbookIds, viewIds, expression }) {
        return loadViewsById({
            workbookIds, viewIds
        })
        .map(({ workbook, view }) => {
            const { expressionsById } = view;
            expressionsById[expression.id] = expression;
            return { workbook, view, expression };
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
                const { input, query } = createExpression(value);
                value = input;
                expression = { ...expression, input, query };
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
        .map(({ workbook, view }) => {
            const { expressionsById } = view;
            const { [expressionId]: expression } = expressionsById;
            if (!expressionsById.hasOwnProperty(expressionId)) {
                return Observable.of({ workbook, view, expressionId })
            }
            delete expressionsById[expressionId];
            return { workbook, view, expression, expressionId };
        });
    }
}

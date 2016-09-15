import React from 'react'
import { container } from '@graphistry/falcor-react-redux';
import {
    ExpressionItem,
    ExpressionsList
} from 'viz-shared/components/expressions';

import {
    addExpression,
    removeExpression,
    updateExpression,
    setExpressionEnabled
} from 'viz-shared/actions/expressions';


export const Expressions = container(
    ({ length = 0, templates = [] }) => `{
        id, name, length, [0...${length}]: ${
            Expression.fragment()
        },
        templates: {
            length, [0...${templates.length}]: {
                name, dataType, attribute, componentType
            }
        }
    }`,
    (expressions) => ({
        expressions,
        name: expressions.name,
        templates: expressions.templates
    }),
    { addExpression, removeExpression }
)(renderExpressions);

export const Expression = container(
    () => `{
        id, input, level, query,
        name, enabled, attribute,
        dataType, componentType, expressionType
    }`,
    (expression) => expression,
    { setExpressionEnabled, updateExpression }
)(ExpressionItem);

function renderExpressions({ templates = [], expressions = [], removeExpression, ...props }) {
    return (
        <ExpressionsList templates={templates} {...props}>
        {expressions.map((expression, index) => (
            <Expression data={expression}
                        templates={templates}
                        key={`${index}: ${expression.id}`}
                        removeExpression={removeExpression}/>
        ))}
        </ExpressionsList>
    );
}

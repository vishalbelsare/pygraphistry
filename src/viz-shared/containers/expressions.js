import React from 'react'
import { container } from 'reaxtor-redux';
import {
    ExpressionItem,
    ExpressionsList
} from 'viz-shared/components/expressions';

import {
    addExpresion,
    removeExpresion,
    updateExpression,
    setExpresionEnabled
} from 'viz-shared/actions/expressions';


export const Expressions = container(
    ({ length = 0, templates = [] }) => `{
        id, name, length, [0...${length}]: ${
            Expression.fragment()
        },
        templates: {
            length, [0...${templates.length}]: {
                name, dataType, attribute
            }
        }
    }`,
    (expressions) => ({ expressions, name: expressions.name, templates: expressions.templates }),
    { addExpresion, removeExpresion }
)(renderExpressions);

export const Expression = container(
    () => `{
        id, input, level, query,
        title, enabled, attribute
    }`,
    (expression) => expression,
    { setExpresionEnabled, updateExpression }
)(ExpressionItem);

function renderExpressions({ expressions = [], removeExpresion, ...props }) {
    return (
        <ExpressionsList {...props}>
        {expressions.map((expression, index) => (
            <Expression data={expression}
                    key={`${index}: ${expression.id}`}
                    removeExpresion={removeExpresion}/>
        ))}
        </ExpressionsList>
    );
}

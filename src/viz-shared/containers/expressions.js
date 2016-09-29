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
    setExpressionEnabled,
    cancelUpdateExpression
} from 'viz-shared/actions/expressions';

let Expressions = ({ templates = [], expressions = [], removeExpression, ...props }) => {
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
};

Expressions = container(
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
)(Expressions);

let Expression = container(
    () => `{
        id, input, level,
        name, enabled, attribute,
        dataType, componentType, expressionType
    }`,
    (expression) => expression,
    { updateExpression,
      setExpressionEnabled,
      cancelUpdateExpression }
)(ExpressionItem);

export { Expressions, Expression };

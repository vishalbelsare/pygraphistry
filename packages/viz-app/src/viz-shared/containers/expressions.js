import React from 'react'
import { container } from '@graphistry/falcor-react-redux';
import styles from 'viz-shared/components/expressions/styles.less';
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

let Expressions = ({ templates = [], expressions = [],
                     addExpression, removeExpression,
                     className = '', style = {}, ...props }) => {
    return (
        <ExpressionsList templates={templates}
                         addExpression={addExpression}
                         style={{ ...style, height: `100%` }} {...props}
                         className={className + ' ' + styles['expressions-list']}>
        {expressions.map((expression, index) => (
            <Expression data={expression}
                        templates={templates}
                        key={`${index}: ${expression.id}`}
                        removeExpression={removeExpression}/>
        ))}
        </ExpressionsList>
    );
};

Expressions = container({
    renderLoading: false,
    fragment: ({ templates = [], ...expressions } = {}) => `{
        id, name, length, ...${
            Expression.fragments(expressions)
        },
        templates: {
            length, [0...${templates.length || 0}]: {
                name, isPrivate, isInternal, dataType, identifier, componentType
            }
        }
    }`,
    mapFragment: (expressions) => ({
        expressions,
        name: expressions.name,
        templates: expressions.templates
    }),
    dispatchers: {
        addExpression,
        removeExpression
    }
})(Expressions);

let Expression = container({
    renderLoading: false,
    fragment: () => `{
        id, input, level,
        readOnly, name, enabled, identifier,
        dataType, componentType, expressionType
    }`,
    dispatchers: {
        updateExpression,
        setExpressionEnabled,
        cancelUpdateExpression
    }
})(ExpressionItem);

export { Expressions, Expression };

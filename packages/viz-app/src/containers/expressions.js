import React from 'react';
import { container } from '@graphistry/falcor-react-redux';
import styles from 'viz-app/components/expressions/styles.less';
import { ExpressionItem, ExpressionsList } from 'viz-app/components/expressions';

import {
  addExpression,
  removeExpression,
  updateExpression,
  setExpressionEnabled,
  cancelUpdateExpression
} from 'viz-app/actions/expressions';

let Expressions = ({
  id,
  removeExpression,
  templates = [],
  expressions = [],
  className = '',
  ...props
}) => {
  return (
    <ExpressionsList
      id={id}
      templates={templates}
      className={`${className} ${styles['expressions-list']}`}
      {...props}>
      {expressions.map((expression, index) => (
        <Expression
          data={expression}
          templates={templates}
          key={`${index}: ${expression.id}`}
          removeExpression={removeExpression}
        />
      ))}
    </ExpressionsList>
  );
};

Expressions = container({
  renderLoading: true,
  fragment: ({ templates = [], ...expressions } = {}) => `{
        id, name, ...${Expression.fragments(expressions)},
        templates: {
            length, [0...${templates.length || 0}]: {
                name, isPrivate, isInternal, dataType, identifier, componentType
            }
        }
    }`,
  mapFragment: expressions => ({
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
  renderLoading: true,
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

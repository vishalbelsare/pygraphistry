export function equals(left, right) {
  return { type: 'EqualityPredicate', operator: '=', left, right };
}
export function not(value) {
  return { type: 'NotExpression', operator: 'NOT', value };
}
export function and(...args) {
  return args.reduce((left, right) => ({
    type: 'BinaryPredicate',
    operator: 'AND',
    left,
    right
  }));
}
export function or(...args) {
  return args.reduce((left, right) => ({
    type: 'BinaryPredicate',
    operator: 'OR',
    left,
    right
  }));
}
export function list(...args) {
  return { type: 'ListExpression', elements: args };
}
export function betweenAnd(value, start, stop) {
  return { type: 'BetweenPredicate', start, stop, value };
}
export function identifier(name) {
  return { type: 'Identifier', name };
}
export function literal(value, dataType) {
  return { type: 'Literal', value, dataType };
}
/**
 * @param value
 * @param {String} dataType
 * @returns {String}
 */
export function printedExpressionOf(value, dataType = typeof value) {
  if (dataType === 'string') {
    return JSON.stringify(value);
  } else if (dataType === 'number') {
    if (typeof value === 'string') {
      // it was serialized to avoid JSON limitations
      return value;
    } else {
      return value.toString(10);
    }
  } else if (dataType === 'boolean') {
    return value.toString().toUpperCase();
  } else if (value === undefined || value === null) {
    return 'NULL';
  } else if (Array.isArray(value)) {
    return '(' + value.map(each => printedExpressionOf(each)).join(', ') + ')';
  } else {
    return JSON.stringify(value);
  }
}
/**
 * @param {ClientQueryAST} ast
 * @returns {String}
 */
export function printAST(ast) {
  if (ast === undefined) {
    return '';
  }
  let properties, elements;
  switch (ast.type) {
    case 'BetweenPredicate':
      properties = {
        value: printAST(ast.value),
        start: printAST(ast.start),
        stop: printAST(ast.stop)
      };
      return [properties.value, 'BETWEEN', properties.start, 'AND', properties.stop].join(' ');
    case 'RegexPredicate':
    case 'LikePredicate':
    case 'BinaryPredicate':
    case 'BinaryExpression':
      properties = {
        left: printAST(ast.left),
        right: printAST(ast.right)
      };
      return [properties.left, ast.operator, properties.right].join(' ');
    case 'UnaryExpression':
      properties = { argument: printAST(ast.argument) };
      if (ast.fixity === 'postfix') {
        return properties.argument + ' ' + ast.operator;
      } else {
        // if (ast.fixity === 'prefix') {
        return ast.operator + ' ' + properties.argument;
      }
    case 'CaseBranch':
      properties = {
        condition: printAST(ast.condition),
        result: printAST(ast.result)
      };
      return [properties.condition, 'THEN', properties.result].join(' ');
    case 'CaseExpression':
      properties = {
        value: printAST(ast.value),
        elseClause: printAST(ast.elseClause)
      };
      elements = ast.cases.map(caseAST => 'WHEN ' + printAST(caseAST));
      return ['CASE', properties.value]
        .concat(elements)
        .concat(ast.elseClause ? ['ELSE', properties.elseClause, 'END'] : ['END'])
        .join(' ');
    case 'ConditionalExpression':
      properties = { elseClause: printAST(ast.elseClause) };
      elements = ast.cases.map(caseAST => 'IF ' + printAST(caseAST));
      return (
        elements.join(' ELSE ') +
        (ast.elseClause ? [' ELSE', properties.elseClause, 'END'] : [' END']).join(' ')
      );
    case 'MemberAccess':
      properties = {
        object: printAST(ast.object),
        property: printAST(ast.property)
      };
      return [properties.object, '[', properties.property, ']'].join('');
    case 'CastExpression':
      properties = { value: printAST(ast.value) };
      return ['CAST', properties.value, 'AS', ast.type_name].join(' ');
    case 'NotExpression':
      properties = { value: printAST(ast.value) };
      return ast.operator + ' ' + properties.value;
    case 'ListExpression':
      elements = ast.elements.map(propAST => printAST(propAST));
      return '(' + elements.join(', ') + ')';
    case 'FunctionCall':
      elements = ast.arguments.map(propAST => printAST(propAST));
      return ast.callee.name + '(' + elements.join(', ') + ')';
    case 'Literal':
      return printedExpressionOf(ast.value, ast.dataType);
    case 'Identifier':
      return ast.name;
    case 'LimitExpression':
      return 'LIMIT ' + printAST(ast.value);
    default:
      throw new Error('Unhandled type: ' + ast.type);
  }
}

export function print(query) {
  if (query === undefined) {
    return undefined;
  } else if (query.inputString) {
    return query.inputString;
  } else if (query.ast) {
    return printAST(query.ast);
  } else {
    return undefined;
  }
}

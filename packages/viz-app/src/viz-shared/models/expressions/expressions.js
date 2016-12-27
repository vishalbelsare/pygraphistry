import parser from './expression-parser.pegjs';
import { parse as parseUtil } from 'pegjs-util';
import { print as printExpression } from './expression-printer';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

import { simpleflake } from 'simpleflakes';
// import { sets } from './sets';
import { filters } from './filters';
import { exclusions } from './exclusions';
import { histograms } from './histograms';

export function expressions(view) {

    const defaultFilter = expression('LIMIT 800000');
    defaultFilter.expressionType = 'filter';
    defaultFilter.readOnly = true;
    defaultFilter.level = 'system';

    return {
        // ...sets(workbookId, viewId),
        ...exclusions(view),
        ...histograms(view),
        ...filters(view, defaultFilter),
        expressionsById: {
            [defaultFilter.id]: {
                ...defaultFilter
            }
        }
    };
}

export { printExpression };

function getExprType (ast) {
    if (ast.argument) {
        return ast.argument;
    } else if (ast.left) {
        const left = getExprType(ast.left);
        if (left) return left;
        return getExprType(ast.right);
    } else if (ast.type === 'Identifier') {
        const parts = ast.name.split(':');
        const componentType = parts[0];
        const attribute = parts.slice(1).join(':');
        return {componentType, attribute, dataType: 'number'};
    }
}

export function expression(inputOrProps = {
                                name: 'degree',
                                dataType: 'number',
                                componentType: 'point'
                           },
                           expressionId = simpleflake().toJSON()) {

    let name = '',
        input = '',
        query = '',
        dataType = '',
        identifier = '',
        componentType = '';

    if (inputOrProps && typeof inputOrProps === 'string') {
        input = inputOrProps;
        query = parseUtil(parser, inputOrProps, { startRule: 'start' });
        if (query.error) {
            return {query};
        } else if (!query.ast) {
            return {query: {error: 'no ast'}};
        }
        const parts = getExprType(query.ast);
        if (parts) {
            componentType = parts.componentType;
            name = parts.attribute;
            dataType = parts.dataType;
            identifier = `${componentType}:${name}`;
        }

    } else if (inputOrProps && typeof inputOrProps === 'object') {
        name = inputOrProps.name || 'degree';
        dataType = inputOrProps.dataType || 'number';
        componentType = inputOrProps.componentType || 'point';
        identifier = `${componentType}:${name}`;
        query = inputOrProps.query || getDefaultQueryForDataType({
            ...inputOrProps, name, dataType, identifier, componentType
        });
        input = printExpression(query);
        if (dataType === 'equals') {
            dataType = 'number';
        }
    }

    return {
        id: expressionId,
        enabled: true,
        level: undefined, /* <-- 'system' | undefined */
        readOnly: false,
        name, input, query,
        dataType, identifier, componentType, /* 'edge' | 'point' */
        expressionType: 'filter', /* <-- 'filter' | 'exclusion' */
    };
}

export function getDefaultQueryForDataType(queryProperties = {}) {

    const { identifier,
            dataType = 'number',
            queryType = dataType } = queryProperties;

    const queryFactory = defaultQueriesMap[queryType] ||
                         defaultQueriesMap[dataType] ||
                         defaultQueriesMap.literal;
    return {
        dataType, attribute: identifier,
        ...queryFactory.call(defaultQueriesMap, queryProperties)
    };
}

const defaultQueriesMap = {
    float(...args) {
        return this.number(...args)
    },
    integer(...args) {
        return this.number(...args)
    },
    number({ identifier, value = 0 }) {
        return {
            start: value, ast: {
                type: 'BinaryExpression',
                operator: '>=',
                left: { type: 'Identifier', name: identifier },
                right: { type: 'Literal', value: value }
            }
        };
    },
    categorical(...args) {
        return this.string(...args);
    },
    string({ identifier, value = 'ABC' }) {
        return {
            equals: value, ast: {
                type: 'BinaryExpression',
                operator: '=',
                left: { type: 'Identifier', name: identifier },
                right: { type: 'Literal', value: value }
            }
        };
    },
    equals({ identifier, value = true }) {
        return {
            equals: value, ast: {
                type: 'BinaryPredicate',
                operator: '=',
                left: { type: 'Identifier', name: identifier },
                right: { type: 'Literal', value: value }
            }
        };
    },
    boolean({ identifier, value = true }) {
        return {
            equals: value, ast: {
                type: 'BinaryPredicate',
                operator: 'IS',
                left: { type: 'Identifier', name: identifier },
                right: { type: 'Literal', value: value }
            }
        }
    },
    datetime(...args) {
        return this.date(...args);
    },
    date({ identifier, value = 'now' }) {
        return {
            ast: {
                type: 'BinaryExpression',
                operator: '>=',
                left: { type: 'Identifier', name: identifier },
                right: { type: 'Literal', value: value }
            }
        };
    },
    literal({ identifier, value = true }) {
        return {
            ast: {
                value, type: 'Literal',
            }
        }
    },
    isOneOf({ identifier, values = [] }) {
        if (!identifier) {
            throw new Error('isOneOf expected identifier: ' + identifier);
        }
        return {
            equals: values, ast: {
                type: 'BinaryPredicate',
                operator: 'IN',
                left: { type: 'Identifier', name: identifier },
                right: {
                    type: 'ListExpression',
                    elements: values.map((value) => ({
                        value, type: 'Literal'
                    }))
                }
            }
        }
    },
    isEqualTo({ identifier, value }) {
        return this.string({ identifier, value });
    },
    isBetween({ identifier, start, stop }) {
        return {
            ast: {
                type: 'BetweenPredicate',
                value: {type: 'Identifier', name: identifier },
                start: {type: 'Literal', value: start },
                stop: {type: 'Literal', value: stop }
            }
        };
    }
};

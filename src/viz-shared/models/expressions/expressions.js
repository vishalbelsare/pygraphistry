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

    const defaultFilter = expression('LIMIT 800000', 'Point Limit');
    defaultFilter.expressionType = 'filter';
    defaultFilter.level = 'system';

    return {
        // ...sets(workbookId, viewId),
        ...exclusions(view),
        ...histograms(view),
        ...filters(view, defaultFilter),
        expressionTemplates: [],
        expressionsById: {
            [defaultFilter.id]: {
                ...defaultFilter
            }
        }
    };
}

export function expression(input = '', name = '',
                           dataType = 'number',
                           attribute = 'point:degree',
                           expressionId = simpleflake().toJSON()) {

    const query = input ?
        parseUtil(parser, input, { startRule: 'start' }) :
        getDefaultQueryForDataType(dataType, attribute);

    const attributeSplitIndex = attribute.lastIndexOf(':');
    const componentType = attributeSplitIndex === -1 ?
        attribute : attribute.substr(0, attributeSplitIndex);

    input = printExpression(query);

    return {
        id: expressionId,
        enabled: true, level: undefined, /* <-- 'system' | undefined */
        name, input, query, dataType, attribute,
        componentType: componentType || 'point', /* 'edge' | 'point' */
        expressionType: 'filter', /* <-- 'filter' | 'exclusion' */
    };
}

export function getDefaultQueryForDataType(dataType = 'number', attribute = 'point:degree') {
    const queryFactory = defaultQueriesMap[dataType] || defaultQueriesMap.literal;
    return {
        dataType, attribute,
        ...queryFactory(attribute)
    };
}

const defaultQueriesMap = {
    float(...args) {
        return this.number(...args)
    },
    integer(...args) {
        return this.number(...args)
    },
    number(attribute, start = 0) {
        return {
            start, ast: {
                type: 'BinaryExpression',
                operator: '>=',
                left: { type: 'Identifier', name: attribute },
                right: { type: 'Literal', value: start }
            }
        };
    },
    categorical(...args) {
        return this.string(...args);
    },
    string(attribute, equals = 'ABC') {
        return {
            equals, ast: {
                type: 'BinaryExpression',
                operator: '=',
                left: { type: 'Identifier', name: attribute },
                right: { type: 'Literal', value: equals }
            }
        };
    },
    boolean(attribute, equals = true) {
        return {
            ast: {
                type: 'BinaryPredicate',
                operator: 'IS',
                left: { type: 'Identifier', name: attribute },
                right: { type: 'Literal', value: equals }
            }
        }
    },
    datetime(...args) {
        return this.date(...args);
    },
    date(attribute) {
        return {
            ast: {
                type: 'BinaryExpression',
                operator: '>=',
                left: { type: 'Identifier', name: attribute },
                right: { type: 'Literal', value: 'now'}
            }
        };
    },
    literal(attribute, value = true) {
        return {
            ast: {
                value, type: 'Literal',
            }
        }
    }
};

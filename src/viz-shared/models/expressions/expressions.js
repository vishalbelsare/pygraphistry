import parser from './expression.pegjs';
import { parse as parseUtil } from 'pegjs-util';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';

import { simpleflake } from 'simpleflakes';
// import { sets } from './sets';
import { filters } from './filters';
import { exclusions } from './exclusions';
import { histograms } from './histograms';

export function expressions(workbookId, viewId) {

    const defaultFilter = expression('LIMIT 800000');
    defaultFilter.level = 'system';
    defaultFilter.title = 'Point Limit';

    return {
        // ...sets(workbookId, viewId),
        ...exclusions(workbookId, viewId),
        ...histograms(workbookId, viewId),
        ...filters(workbookId, viewId, defaultFilter),
        expressions: [],
        expressionsById: {
            [defaultFilter.id]: {
                ...defaultFilter
            }
        }
    };
}

export function expression(input, expressionId = simpleflake().toJSON()) {
    return {
        id: expressionId,
        input: input,
        enabled: true,
        level: undefined, /* <-- { 'system', 'filter', 'exclusion' }*/
        title: undefined,
        attribute: undefined,
        query: parseUtil(parser, input, { startRule: 'start' })
    };
}

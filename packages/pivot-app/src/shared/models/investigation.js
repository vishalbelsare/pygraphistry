import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from '@graphistry/falcor-json-graph';

import { simpleflake } from 'simpleflakes';

export function investigation(investigation, index, id = simpleflake().toJSON()) {
    return {
        name: `Investigation: ${investigation.name || index}`,
        url: investigation.url || 'http://www.graphistry.com',
        id: id,
        templates: 'all',
        status: null,
        pivots: investigation.pivots.map((pivot) => $ref(`pivotsById['${pivot.id}']`))
    };
}



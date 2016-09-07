import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from 'falcor-json-graph';

import { simpleflake } from 'simpleflakes';

export function investigation(name = 'default', pivots, url = 'http://www.graphistry.com', id = simpleflake().toJSON()) {
    const pivotRefs = pivots.map((pivot, index) => (
        $ref(`pivotsById['${pivot.id}']`)
    ))
    return {
        url, id, name, length: pivots.length,
        ...pivotRefs
    }
}



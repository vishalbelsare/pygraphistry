import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from '@graphistry/falcor-json-graph';

import { simpleflake } from 'simpleflakes';

export function investigation(name = 'default', pivots, templates = 'all', url = process.env.GRAPHISTRY_HOMEPAGE || 'http://www.graphistry.com/', id = simpleflake().toJSON()) {
    const pivotRefs = pivots.map((pivot, index) => (
        $ref(`pivotsById['${pivot.id}']`)
    ))
    pivotRefs.url = url;
    pivotRefs.name = name;
    pivotRefs.id = id;
    pivotRefs.templates = templates;
    return pivotRefs;
    //return {
        //url, id, name, length: pivots.length,
        //...pivotRefs
    //}
}



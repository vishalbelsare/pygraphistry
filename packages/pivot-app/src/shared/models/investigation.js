import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from '@graphistry/falcor-json-graph';

import { simpleflake } from 'simpleflakes';

export function createInvestigationModel(serializedInvestigation, index) {
    const defaults = {
        name: `Investigation: ${index}`,
        url: 'http://www.graphistry.com',
        id: simpleflake().toJSON(),
        pivots: []
    }

    const normalizedInvestigation = {...defaults, ...serializedInvestigation};

    const initialSoftState = {
        status: null,
        pivots: normalizedInvestigation.pivots.map((pivotId) =>
            $ref(`pivotsById['${pivotId}']`)
        )
    }

    return {...normalizedInvestigation, ...initialSoftState};
}



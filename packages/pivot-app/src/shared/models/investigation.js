import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from '@graphistry/falcor-json-graph';

import { simpleflake } from 'simpleflakes';

export function createInvestigationModel(serializedInvestigation, index) {
    const defaults = {
        name: `Untitled Investigation ${index}`,
        url: 'http://www.graphistry.com',
        id: simpleflake().toJSON(),
        pivots: []
    }

    const normalizedInvestigation = {...defaults, ...serializedInvestigation};

    const initialSoftState = {
        status: {ok: true},
        pivots: normalizedInvestigation.pivots.map((pivotId) =>
            $ref(`pivotsById['${pivotId}']`)
        )
    }

    return {...normalizedInvestigation, ...initialSoftState};
}

export function serializeInvestigationModel({name, url, id, templates, pivots}) {
    return {
        name, url, id, templates,
        pivots: pivots.map(pivotRef => pivotRef.value[1])
    };
}

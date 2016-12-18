import {
    ref as $ref,
} from '@graphistry/falcor-json-graph';
import _ from 'underscore';
import { simpleflake } from 'simpleflakes';
import { atomify, deatomify } from './support';


function defaults(index) {
    return {
        name: `Untitled Investigation ${index}`,
        id: simpleflake().toJSON(),
        description: '',
        tags: [],
        modifiedOn: Date.now(),
        pivots: []
    };
}

function initialSoftState(pivots) {
    return {
        url: null,
        status: {ok: true, etling: false},
        eventTable: {},
        pivots: pivots.map((pivotId) =>
            $ref(`pivotsById['${pivotId}']`)
        ),
        detachedPivots: [],
    };
}

export function createInvestigationModel(serializedInvestigation, index) {
    const normalizedInvestigation = {
        ...defaults(index || ''),
        ...serializedInvestigation
    };

    normalizedInvestigation.tags = atomify(normalizedInvestigation.tags);

    return {
        ...normalizedInvestigation,
        ...initialSoftState(normalizedInvestigation.pivots)
    };
}

export function serializeInvestigationModel(investigation) {
    const hardState = _.pick(investigation, _.keys(defaults()));

    hardState.pivots = hardState.pivots.map(pivotRef => pivotRef.value[1]);
    hardState.tags = deatomify(hardState.tags);

    return hardState;
}

export function cloneInvestigationModel(investigation, clonedPivots) {
    const deepCopy = JSON.parse(JSON.stringify(serializeInvestigationModel(investigation)));

    return {
        ...deepCopy,
        ...initialSoftState(_.pluck(clonedPivots, 'id')),
        id: simpleflake().toJSON(),
        name: `Copy of ${investigation.name}`,
    };
}

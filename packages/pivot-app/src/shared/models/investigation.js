import {
    ref as $ref,
} from '@graphistry/falcor-json-graph';
import _ from 'underscore';
import { simpleflake } from 'simpleflakes';
import { atomify, deatomify } from './support';

import logger from '../logger.js';
const log = logger.createLogger(__filename);


function defaults(index) {
    return {
        name: `Untitled Investigation ${index}`,
        id: simpleflake().toJSON(),
        description: '',
        tags: [],
        modifiedOn: Date.now(),
        layout: "stackedBushyGraph",
        pivots: []
    };
}

function initialSoftState(pivots) {
    return {
        url: null,
        axes: [],
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
    const oldPivotIds = investigation.pivots.map(x => x.value[1]);
    const newPivotIds = clonedPivots.map(({id}) => id);
    const pivots = clonedPivots.map((pivot) => {
        const pivotRefs = pivot.pivotRefs
        delete pivot.pivotRefs;
        const pivotParameters = Object.entries(pivot.pivotParameters)
            .reduce((result, [key, value]) => {
                if (pivotRefs.indexOf(key) >= 0) {
                    value.value = value.value.map((val) => newPivotIds[oldPivotIds.indexOf(val)]);
                } 
                result[key] = value
                return result;
            }, {})
        return { pivotParameters, ...pivot };
    });

    return {
        ...deepCopy,
        ...initialSoftState(_.pluck(pivots, 'id')),
        id: simpleflake().toJSON(),
        name: `Copy of ${investigation.name}`,
    };
}

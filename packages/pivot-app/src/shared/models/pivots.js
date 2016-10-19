import {
    ref as $ref,
} from '@graphistry/falcor-json-graph';
import { simpleflake } from 'simpleflakes';
import PivotTemplates from '../models/PivotTemplates';
import _ from 'underscore';


function defaults() {
    return {
        id: simpleflake().toJSON(),
        enabled: false,
        pivotParameters: {
            query: 'Enter search query',
        },
        pivotTemplate: "42"
    };
}

function initialSoftState(pivotTemplate) {
    return {
        pivotTemplate: $ref(`templatesById[${pivotTemplate}]`),
        status: {ok: true},
        resultCount: 0,
        resultSummary: {entities: []}
    };
}

export function createPivotModel(serializedPivot) {
    const normalizedPivot = {
        ...defaults(),
        ...serializedPivot
    };


    return {
        ...normalizedPivot,
        ...initialSoftState(normalizedPivot.pivotTemplate)
    };
}

export function serializePivotModel(pivot) {
    const hardState = _.pick(pivot, _.keys(defaults()));
    hardState.pivotTemplate = hardState.pivotTemplate.value[1];
    return hardState;
}

export function clonePivotModel(pivot) {
    const deepCopy = JSON.parse(JSON.stringify(serializePivotModel(pivot)));
    return {
        ...deepCopy,
        id: simpleflake().toJSON(),
        ...initialSoftState(pivot.pivotTemplate)
    };
}

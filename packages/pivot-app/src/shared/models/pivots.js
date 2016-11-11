import {
    ref as $ref,
} from '@graphistry/falcor-json-graph';
import { simpleflake } from 'simpleflakes';
import _ from 'underscore';


function defaults() {
    return {
        id: simpleflake().toJSON(),
        enabled: false,
        pivotParameters: {
            query: 'Enter search query',
        },
        pivotTemplate: 'search-splunk-plain'
    };
}

function initialSoftState(pivotTemplate) {
    return {
        pivotTemplate: $ref(`templatesById['${pivotTemplate}']`),
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
    hardState.pivotTemplate = pivot.pivotTemplate.value[1];
    return hardState;
}

export function clonePivotModel(pivot) {
    const deepCopy = JSON.parse(JSON.stringify(serializePivotModel(pivot)));
    const clonedHardState = {
        ...deepCopy,
        id: simpleflake().toJSON()
    };
    return createPivotModel(clonedHardState);
}

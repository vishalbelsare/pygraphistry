import { simpleflake } from 'simpleflakes';
import { listTemplates } from '../services/loadTemplates.js'
import _ from 'underscore';
import { ref as $ref } from '@graphistry/falcor-json-graph';
import logger from '../logger.js';
import { atomify, deatomify } from './support';

const log = logger.createLogger(__filename);

const templatesMap = listTemplates();

function defaults(pivotTemplate = 'search-splunk-plain') {

    const template = templatesMap[pivotTemplate];
    const templateParameters = template.pivotParametersUI;
    const pivotParameters = Object.entries(templateParameters)
        .reduce((result, [key, value]) => {
            result[key] = value.defaultValue;
            return result
        }, {});


    return {
        id: simpleflake().toJSON(),
        enabled: false,
        pivotParameters,
        pivotTemplate,
    };
}

function initialSoftState(pivotTemplate) {
    return {
        pivotTemplate: $ref(`templatesById['${pivotTemplate}']`),
        status: {ok: true, searching: false},
        resultCount: -1,
        resultSummary: {entities: []}
    };
}

export function createPivotModel(serializedPivot) {
    const normalizedPivot = {
        ...defaults(),
        ...serializedPivot
    };

    // Convert object params to atoms if necessary
    normalizedPivot.pivotParameters = _.mapObject(normalizedPivot.pivotParameters, atomify);

    return {
        ...normalizedPivot,
        ...initialSoftState(normalizedPivot.pivotTemplate)
    };
}

export function serializePivotModel(pivot) {
    const hardState = _.pick(pivot, _.keys(defaults()));

    // Deref template
    hardState.pivotTemplate = pivot.pivotTemplate.value[1];
    // Unwrap atom$ in pivotParameters
    hardState.pivotParameters = _.mapObject(hardState.pivotParameters, deatomify);

    return hardState;
}

export function clonePivotModel(pivot) {
    const deepCopy = JSON.parse(JSON.stringify(serializePivotModel(pivot)));
    const templateId = pivot.pivotTemplate.value[1];
    const template = templatesMap[templateId];
    deepCopy.pivotParameters = Object.entries(deepCopy.pivotParameters)
        .filter(([key]) => key.startsWith(templateId))
        .reduce((result, [key, value]) => {
            result[key] = value
            return result;
        }, {});
    deepCopy.pivotRefs = Object.values(template.pivotParametersUI)
        .filter((parameter) => parameter.inputType === 'pivotCombo')
        .map(({id}) => id);
    const clonedHardState = {
        ...deepCopy,
        id: simpleflake().toJSON()
    };
    return createPivotModel(clonedHardState);
}

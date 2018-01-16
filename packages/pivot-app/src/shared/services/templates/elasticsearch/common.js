export const commonPivots = {
    index: {
        name: 'index',
        inputType: 'text',
        label: 'Index:',
        placeholder: 'grfy-*',
        defaultValue: 'grfy-*'
    },
    type: {
        name: 'type',
        inputType: 'text',
        label: 'Type:',
        placeholder: 'event',
        defaultValue: 'event'
    },
    size: {
        name: 'size',
        inputType: 'text',
        label: 'Type:',
        placeholder: 'event',
        defaultValue: 'event'
    },
    jq: {
        name: 'jq',
        inputType: 'textarea',
        label: 'Postprocess with jq:',
        placeholder: '.'
    },
    outputType: {
        name: 'outputType',
        label: 'shape',
        inputType: 'combo',
        options: [{ value: 'table', label: 'table' }, { value: 'graph', label: 'graph' }]
    },
    time: {
        name: 'time',
        label: 'Time',
        inputType: 'daterange',
        default: { from: null, to: null }
    }
};

export function makeNodes(desiredEntities) {
    return {
        name: 'fields',
        inputType: 'multi',
        label: 'Entities:',
        options: desiredEntities.map(x => ({ id: x, name: x })),
        defaultValue: desiredEntities
    };
}

export function makeAttributes(desiredAttributes) {
    return {
        name: 'attributes',
        inputType: 'multi',
        label: 'Attributes:',
        options: desiredAttributes.map(x => ({ id: x, name: x }))
    };
}

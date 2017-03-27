import logger from '../../../../shared/logger.js';
const log = logger.createLogger(__filename);


export const PARAMETERS = [
    {
        name: 'endpoint',
        inputType: 'text',
        label: 'URL:',
        placeholder: 'http://'
    },
    {
        name: 'jq',
        inputType: 'text',
        label: 'Postprocess with jq:',
        placeholder: '.'
    },
    {
        name: 'nodes',
        inputType: 'multi',
        label: 'Nodes:',
        options: [],
    },
    {
        name: 'attributes',
        inputType: 'multi',
        label: 'Attributes:',
        options: [],
    }
];

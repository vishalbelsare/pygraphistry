import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);

export { encodings } from '../splunk/settings.js';

export const PARAMETERS = [
    {
        name: 'instructions',
        inputType: 'label',
        isVisible: false
    },
    {
        name: 'endpoint',
        inputType: 'textarea',
        label: 'URL:',
        placeholder: 'http://'
    },
    {
        name: 'method',
        label: 'method',
        inputType: 'combo',
        options: [{ value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' }]
    },
    {
        name: 'timeout',
        inputType: 'number',
        label: 'timeout (s):',
        placeholder: '10',
        defaultValue: 10
    },
    {
        name: 'headers',
        label: 'headers',
        inputType: 'multi',
        options: []
    },
    {
        name: 'body',
        inputType: 'textarea',
        label: 'body',
        placeholder: ''
    },
    {
        name: 'jq',
        inputType: 'textarea',
        label: 'Postprocess with jq:',
        placeholder: '.'
    },
    {
        name: 'outputType',
        label: 'shape',
        inputType: 'combo',
        options: [{ value: 'table', label: 'table' }, { value: 'graph', label: 'graph' }]
    },
    {
        name: 'nodes',
        inputType: 'multi',
        label: 'Nodes:',
        options: []
    },
    {
        name: 'attributes',
        inputType: 'multi',
        label: 'Attributes:',
        options: []
    }
];

//?{name -> str U [ str ] U {value: str} U {value: [ str ]}} -> {name -> str}
export function flattenParams(params = {}) {
    return Object.keys(params).reduce((o, k) => {
        const unwrapped =
            params[k] instanceof Object && 'value' in params[k] ? params[k].value : params[k];
        const flattened =
            unwrapped instanceof Array ? unwrapped.map(s => `"${s}"`).join(',') : unwrapped;
        o[k] = flattened;
        return o;
    }, {});
}

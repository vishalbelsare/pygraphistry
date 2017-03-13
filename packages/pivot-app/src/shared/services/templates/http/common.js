import { VError } from 'verror'

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

export function bindTemplateString (str = '', event = {}, params = {}) {
    return str.split(/({.*?})/) // x={...}&y={...} => ['x=','{...}','&y=','{...}']
        .map((arg) => {
            if ((arg.length > 2) && (arg[0] === '{') && (arg[arg.length - 1] === '}')) {
                const name = arg.slice(1,-1).trim();
                if (name in params) {
                    return params[name];
                } else if (name in event) {
                    return event[name];
                } else {
                    log.error('Template parameter not found in event, pivot params', {str,name});
                    throw new VError({
                        name: 'Template parameter not found in event, pivot params',
                        info: { str, name },
                    }, 'Failed to run jq post process', { str, name });
                }
            } else {
                return arg;
            }
        }).join('');
}

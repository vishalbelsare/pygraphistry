import template from 'string-template';

import { HttpPivot } from './httpPivot';
import { PARAMETERS } from './common.js';
import logger from '../../../../shared/logger.js';
const log = logger.createLogger(__filename);

import { demoEncodings } from './common.js';


export const HTTP_SEARCH = new HttpPivot({
    id: 'http-search',
    name: 'Search through a URL',
    tags: ['Demo', 'Splunk'],
    attributes: [ ],
    connections: [ ],    
    toUrls: function ({ endpoint }) {

        const params = { };
        const url = template(endpoint, params);

        log.debug('url', url);

        return [ { url, params } ];
    },
    parameters: 
        [{
            name: 'instructions',
            inputType: 'label',
            isVisible: false
        }].concat(PARAMETERS),
    encodings: demoEncodings
});
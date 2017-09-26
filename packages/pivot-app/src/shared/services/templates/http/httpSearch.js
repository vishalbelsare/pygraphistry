import { template } from '../../support/template';
import { HttpPivot } from './httpPivot';
import { PARAMETERS } from './common.js';
import logger from '../../../../shared/logger.js';
const log = logger.createLogger(__filename);

import { encodings, flattenParams } from './common.js';


export const HTTP_SEARCH = new HttpPivot({
    id: 'http-search',
    name: 'Search through a URL',
    tags: ['Demo', 'Splunk'],
    toUrls: function (params) {

        const { endpoint, body, method = 'GET' } = params;

        const urlParams = flattenParams(params);
        const url = template(endpoint, urlParams);
        const bodyConcrete =
            method === 'POST' ? template(body, urlParams)
            : undefined;


        log.debug('url', url);

        return [ { 
            url, 
            params: urlParams, 
            ...(method === 'POST'? { body: bodyConcrete } : {})
        }];
    },
    parameters: 
        [{
            name: 'instructions',
            inputType: 'label',
            isVisible: false
        }].concat(PARAMETERS),
    encodings: encodings
});
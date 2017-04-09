import { template } from '../../support/template';
import { HttpPivot } from './httpPivot';
import { PARAMETERS } from './common.js';
import logger from '../../../../shared/logger.js';
const log = logger.createLogger(__filename);

import { demoEncodings, flattenParams } from './common.js';


export const HTTP_SEARCH = new HttpPivot({
    id: 'http-search',
    name: 'Search through a URL',
    tags: ['Demo', 'Splunk'],
    toUrls: function (params) {

        const { endpoint } = params;

        const urlParams = flattenParams(params);
        const url = template(endpoint, urlParams);

        log.debug('url', url);

        return [ { url, params: urlParams } ];
    },
    parameters: 
        [{
            name: 'instructions',
            inputType: 'label',
            isVisible: false
        }].concat(PARAMETERS),
    encodings: demoEncodings
});
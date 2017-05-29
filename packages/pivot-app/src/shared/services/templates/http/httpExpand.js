import { template } from '../../support/template';
import { HttpPivot } from './httpPivot';
import { PARAMETERS } from './common.js';
import logger from '../../../../shared/logger.js';
const log = logger.createLogger(__filename);

import { demoEncodings, flattenParams } from './common.js';


export const HTTP_EXPAND = new HttpPivot({
    id: 'http-expand',
    name: 'Expand with a URL',    
    tags: ['Demo', 'Splunk'],
    parameters:
        [{
            name: 'instructions',
            inputType: 'label',
            isVisible: false
        },
        {
            name: 'pRef',
            inputType: 'pivotCombo',
            label: 'Any event in:',
        }].concat(PARAMETERS),
    toUrls: function (params, pivotCache) {

        const { endpoint = '', pRef, body, method = 'GET' } = params;

        const refVal = pRef ? pRef.value : '';
        
        const pivots = refVal instanceof Array ? refVal : [refVal];
        const events = pivots.map((refVal) => pivotCache[refVal].events);

        return [].concat.apply([], events)
            .map((row, i) => {
                try {
                    const urlParams = {...row, ...flattenParams(params) };
                    const url = template(endpoint, urlParams);
                    const bodyConcrete =
                        method === 'POST' ? template(body, urlParams)
                        : undefined;                    
                    log.debug('row endpoint', url, i, row);
                    return { 
                        url, 
                        params: urlParams, 
                        ...(method === 'POST' ? { body: bodyConcrete } : {})
                    };
                } catch (e) {
                    return e;
                }
            });

    },
    encodings: demoEncodings
});


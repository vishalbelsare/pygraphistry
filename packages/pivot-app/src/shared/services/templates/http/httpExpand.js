import template from 'string-template';

import { HttpPivot } from './httpPivot';
import { PARAMETERS } from './common.js';
import logger from '../../../../shared/logger.js';
const log = logger.createLogger(__filename);

import { demoEncodings } from './common.js';


export const HTTP_EXPAND = new HttpPivot({
    id: 'http-expand',
    name: 'Expand with a URL',    
    tags: ['Demo', 'Splunk'],
    attributes: [ ],
    connections: [ ],    
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
    toUrls: function ({ endpoint = '', nodes, attributes, pRef }, pivotCache) {

        const refVal = pRef ? pRef.value : '';
        
        const pivots = refVal instanceof Array ? refVal : [refVal];
        const events = pivots.map((refVal) => pivotCache[refVal].events);
        return [].concat.apply([], events)
            .map((row, i) => {
                const url = template(endpoint, {
                    ...row,
                    endpoint, 
                    nodes: this.connections,
                    attributes: this.attributes
                });
                log.debug('row endpoint', url, i ,row);
                return url;
            });

    },
    encodings: demoEncodings
});


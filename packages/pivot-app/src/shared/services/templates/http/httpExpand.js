import stringhash from 'string-hash';

import { HttpPivot } from './HttpPivot';
import { PARAMETERS, bindTemplateString } from './common.js';
import logger from '../../../../shared/logger.js';
const log = logger.createLogger(__filename);


export const HTTP_EXPAND = new HttpPivot({
    id: 'http-expand',
    name: 'Expand with a URL',    
    tags: ['Demo', 'Splunk'],
    attributes: [ ],
    connections: [ ],    
    parameters:
        [{
            name: 'pRef',
            inputType: 'pivotCombo',
            label: 'Any event in:',
        }].concat(PARAMETERS),
    toUrls: function ({ endpoint = '', nodes, attributes, pRef }, pivotCache) {

        const refVal = pRef ? pRef.value : '';

        //update dropdown optionlists
        this.connections = nodes ? nodes.value : [];
        this.attributes = attributes ? attributes.value : [];

        log.info('pivot refVal', refVal);

        const pivots = refVal instanceof Array ? refVal : [refVal];
        const events = pivots.map((refVal) => pivotCache[refVal].events);
        return [].concat.apply([], events)
            .map((row, i) => {
                log.info('row', i, row);                
                const url = bindTemplateString(endpoint, row, {
                    endpoint, 
                    nodes: this.connections,
                    attributes: this.attributes
                });
                log.info('row endpoint', url);
                return url;
            });

    },
    encodings: {
        point: {
            pointColor: (node) => {
                node.pointColor = stringhash(node.type) % 12;
            }
        }
    }
});


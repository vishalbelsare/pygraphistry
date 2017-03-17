import stringhash from 'string-hash';
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
    toUrls: function ({ endpoint, nodes, attributes }) {

        //update dropdown optionlists
        this.connections = nodes ? nodes.value : [];
        this.attributes = attributes ? attributes.value : [];

        const url = template(endpoint, {
            endpoint, 
            nodes: this.connections,
            attributes: this.attributes
        });

        log.debug('url', url);

        return [url];
    },
    parameters: PARAMETERS,
    encodings: demoEncodings
});
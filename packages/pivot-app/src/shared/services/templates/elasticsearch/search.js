import logger from '../../../logger.js';
const log = logger.createLogger(__filename);

import { ElasticsearchPivot } from './esPivot.js';
import { encodings } from './settings.js';

export const searchES = new ElasticsearchPivot({
    id: 'search-es-plain',
    name: 'Search Elasticsearch',
    tags: ['ElasticSearch'],
    parameters: [
        {
            name: 'query',
            inputType: 'textarea',
            label: 'Query:',
            placeholder: 'error',
            defaultValue: 'error'
        }
    ],
    toES: function(args) {
        return args.query || '';
    },
    encodings
});

export const pivots = [searchES];

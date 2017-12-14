import logger from '../../../logger.js';
const log = logger.createLogger(__filename);

import { ElasticsearchPivot } from './esPivot.js';
import { encodings } from './settings.js';

export const searchES = new ElasticsearchPivot({
    id: 'search-es-plain',
    name: 'Elasticsearch: Search',
    tags: ['ElasticSearch'],
    parameters: [
        {
            name: 'index',
            inputType: 'text',
            label: 'Index:',
            placeholder: 'nvda-*',
            defaultValue: 'nvda-*'
        },
        {
            name: 'type',
            inputType: 'text',
            label: 'Type:',
            placeholder: '',
            defaultValue: ''
        },
        {
            name: 'query',
            inputType: 'textarea',
            label: 'Query:',
            placeholder:
                '{\n' +
                '  "query": {\n' +
                '    "exists": { "field" : "EventID" }\n' +
                '  }\n' +
                '}',
            defaultValue:
                '{\n' + '  "query": {\n' + '    "exists": { "field" : "EventID" }\n' + '  }\n' + '}'
        }
    ],
    toES: function(args) {
        return {
            query: args.query || '',
            index: args.index || ''
        };
    },
    encodings
});

export const pivots = [searchES];

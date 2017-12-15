import logger from '../../../logger.js';
const log = logger.createLogger(__filename);

import { EsPivot } from './esPivot.js';
import { encodings } from './settings.js';

import { products } from './vendors';

function searchPivot({ product, productIdentifier, desiredEntities, desiredAttributes }) {
    const productId = product === 'Elasticsearch' ? '' : '-' + product.replace(/ /g, '');

    return new EsPivot({
        id: 'search-es-plain',
        name: 'Elasticsearch: Search',
        tags: ['ElasticSearch'],
        parameters: [
            {
                name: 'index',
                inputType: 'text',
                label: 'Index:',
                placeholder: 'grfy-*',
                defaultValue: 'grfy-*'
            },
            /*{
                name: 'type',
                inputType: 'text',
                label: 'Type:',
                placeholder: '',
                defaultValue: ''
            },*/
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
                    '{\n' +
                    '  "query": {\n' +
                    '    "exists": { "field" : "EventID" }\n' +
                    '  }\n' +
                    '}'
            },
            {
                name: 'fields',
                inputType: 'multi',
                label: 'Entities:',
                options: desiredEntities.map(x => ({ id: x, name: x })),
                defaultValue: desiredEntities
            },
            {
                name: 'attributes',
                inputType: 'multi',
                label: 'Attributes:',
                options: desiredAttributes.map(x => ({ id: x, name: x }))
            },
            {
                name: 'time',
                label: 'Time',
                inputType: 'daterange',
                default: { from: null, to: null }
            }
        ],
        toES: function({ index, query, fields, attributes }, pivotCache, { time } = {}) {
            this.connections = fields.value;

            const _query = {
                index: index,
                type: 'event',
                body: JSON.parse(query)
            };
            if (fields.value !== null) {
                _query['_source'] = fields.value;
            }
            return {
                searchQuery: _query,
                searchParams: this.dayRangeToSplunkParams((time || {}).value, time)
            };
        },
        encodings
    });
}

export const pivots = Object.values(products).map(searchPivot);

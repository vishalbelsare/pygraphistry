import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);

import { SplunkPivot } from './splunkPivot.js';
import { encodings } from './settings.js';
import { products } from './vendors';

function searchPivot({ product, productIdentifier, desiredEntities, desiredAttributes }) {
    const productId = product === 'Splunk' ? '' : '-' + product.replace(/ /g, '');

    const indexFilter = Object.keys(productIdentifier || {})
        .map(key => ` "${key}"="${productIdentifier[key]}" `)
        .join(' AND ');

    return new SplunkPivot({
        id: `search-splunk-plain${productId}`,
        name: `${product}: Search`,

        tags: ['Splunk'],
        parameters: [
            {
                name: 'query',
                inputType: 'text',
                label: 'Query:',
                placeholder: 'error',
                defaultValue: 'error'
            },
            {
                name: 'index',
                inputType: 'text',
                label: 'Index',
                placeholder: indexFilter || 'index=* AND product=* AND vendor=*',
                defaultValue: indexFilter
            },
            {
                name: 'max',
                inputType: 'number',
                label: 'Max Results',
                placeholder: 100,
                defaultValue: 100
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
        toSplunk: function(args, pivotCache, { time } = {}) {
            this.connections = args.fields.value;

            const head = args.max === undefined || args.max === '' ? '' : ` | head ${args.max} `;

            const query = `
                search ${args.index} ${args.query}
                ${this.constructFieldString()}
                ${head}`;

            return {
                searchQuery: query,
                searchParams: this.dayRangeToSplunkParams((args.time || {}).value, time)
            };
        },
        encodings
    });
}

export const pivots = Object.values(products).map(searchPivot);

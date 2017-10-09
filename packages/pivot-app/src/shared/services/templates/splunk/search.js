import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);


import { SplunkPivot } from './splunkPivot.js';
import { encodings } from './settings.js';
import { products } from './vendors';


function searchPivot ( {product, productIdentifier, desiredEntities, desiredAttributes} ) {

    const productId = product === 'Splunk' ? '' : '-' + product.replace(/ /g,'');

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
                defaultValue: 'error',
            },
            {
                name: 'fields',
                inputType: 'multi',
                label: 'Entities:',
                options: desiredEntities.map(x => ({id:x, name:x})),
                defaultValue: desiredEntities
            },
            {
                name: 'attributes',
                inputType: 'multi',
                label: 'Attributes:',
                options: desiredAttributes.map(x => ({id:x, name:x}))
            },
            {
                name: 'time',
                label: 'Time',
                inputType: 'daterange',
                default: { from: null, to: null }
            }
        ],
        toSplunk: function (args, pivotCache, { time } = {}) {

            this.connections = args.fields.value;

            const indexFilter =
                Object.keys(productIdentifier || {})
                    .map((key) => ` "${key}"="${productIdentifier[key]}" `)
                    .join(' AND ');


            const query = `
                search ${indexFilter}${args.query}
                ${this.constructFieldString()}
                ${ (args.query||'').indexOf(' head ') === -1 ? ' | head 1000 ' : ''}`;

            return {
                searchQuery: query,
                searchParams: this.dayRangeToSplunkParams((args.time||{}).value, time)
            };

        },
        encodings
    });

}


export const pivots = Object.values(products).map(searchPivot);
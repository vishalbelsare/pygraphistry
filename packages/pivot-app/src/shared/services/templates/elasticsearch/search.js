import logger from '../../../logger.js';
const log = logger.createLogger(__filename);

import { EsPivot } from './esPivot.js';
import { encodings } from '../splunk/settings.js';

import { products } from '../splunk/vendors';
import { commonPivots, makeNodes, makeAttributes } from './common.js';
const esb = require('elastic-builder'); // the builder

function searchPivot({ product, productIdentifier, desiredEntities, desiredAttributes }) {
    const productId = product === 'Elasticsearch' ? '' : '-' + product.replace(/ /g, '');

    return new EsPivot({
        id: 'search-es-plain',
        name: 'Elasticsearch: Search',
        tags: ['ElasticSearch'],
        parameters: [
            commonPivots.index,
            commonPivots.type,
            {
                name: 'query',
                inputType: 'textarea',
                label: 'Query:',
                placeholder: `{
    "query": {
    "bool": {
      "must": {
        "match_all": {}
      }
    }
    }
}`,
                defaultValue: `{
    "query": {
    "bool": {
      "must": {
        "match_all": {}
      }
    }
    }
}`,
            },
            commonPivots.jq,
            commonPivots.outputType,
            makeNodes(desiredEntities),
            makeAttributes(desiredAttributes),
            commonPivots.time
        ],
        toES: function({ index, query, type, fields, attributes }, pivotCache, { time } = {}) {
            this.connections = fields.value;
            let _query = JSON.parse(query);

            if (time.from !== undefined){
                _query.query.bool.filter = {
                    range: {
                        timestamp: this.dayRangeToElasticsearchParams((time || {}).value, time)
                    }
                };
            }

            _query = {
                index: index,
                type: type,
                body: _query
            };



            if (
                fields &&
                attributes &&
                fields.value &&
                fields.value.length > 1 &&
                fields.value.indexOf('*') === -1 &&
                attributes.value &&
                attributes.length > 1 &&
                attributes.value.indexOf('*') === -1
            ) {
                _query['_source'] = fields.value.concat(attributes.value);
            }

            return {
                searchQuery: _query
            };
        },
        encodings
    });
}

export const pivots = Object.values(products).map(searchPivot);

import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);

import { defaultFields as FIELDS } from './settings.js';
import { EsPivot } from './esPivot.js';
import { encodings } from './settings.js';
import { products } from './vendors';

//remove line breaks and escape double quotes, slashes
// a -> str
function clean(vRaw) {
    if (vRaw === undefined || vRaw === null) {
        return '';
    }
    return String(vRaw)
        .replace(/([\r\n])/gm, '')
        .replace(/"/g, '\\"')
        .replace(/\\/g, '\\\\')
        .trim();
}

//only do splunk searches on non-empty vals
// str -> bool
function valid(v) {
    return v.length && v !== '""';
}

function addNodeByKey(hash, k, vRaw) {
    const v = clean(vRaw);
    if (!valid(v)) {
        return;
    }

    if (!hash[k]) {
        hash[k] = { [v]: true };
    } else {
        const bin = hash[k];
        if (!bin[v]) {
            bin[v] = true;
        }
    }
}

function addNodeByVal(hash, k, vRaw) {
    const v = clean(vRaw);
    if (!valid(v)) {
        return;
    }

    if (!hash[v]) {
        hash[v] = true;
    }
}

export function intersectionMatch(a, b) {
    if (!a || !b) {
        return false;
    }
    const len = a.length;
    for (let i = 0; i < len; i++) {
        if (b.indexOf(a[i]) !== -1) {
            return true;
        }
    }
    return false;
}

// Use all fields if a field is "*", or fields empty
// ... -> str
export function expand({
    pivotIds = [],
    pivotCache = {},
    pivotFields = [],
    filter = '',
    filterPost = '',
    colMatch = true,
    matchAttributes = true
}) {
    log.info('EXPAND RECV', { colMatch, matchAttributes });

    const isAllFields = !pivotFields.length || pivotFields.filter(fld => fld === '*').length;

    //{v->bool} or {k->{v->bool}}
    const matches = {};
    const adder = colMatch ? addNodeByKey : addNodeByVal;
    const reserved = ['pointTitle', 'pointIcon', 'pointSize', 'pointColor', 'type', 'node'];
    pivotIds.forEach(pivotId => {
        const { results = {} } = pivotCache[pivotId] || {};
        (results.labels || []).forEach(node => {
            if (
                isAllFields ||
                pivotFields.indexOf(node.type) > -1 ||
                pivotFields.indexOf(node.canonicalType) > -1 ||
                intersectionMatch(pivotFields, node.refTypes) ||
                intersectionMatch(pivotFields, node.cols)
            ) {
                adder(matches, node.type, node.node);
            }

            if (matchAttributes) {
                for (const fld in node) {
                    if (
                        (isAllFields && reserved.indexOf(fld) === -1) ||
                        pivotFields.indexOf(fld) > -1
                    ) {
                        //explicitly opt into reserved fields
                        adder(matches, fld, node[fld]);
                    }
                }
            }
        });
    });

    return matches;
}

function expandPivot({ product, productIdentifier, desiredEntities, desiredAttributes }) {
    const productId = product === 'Elasticsearch' ? '' : '-' + product.replace(/ /g, '');

    return new EsPivot({
        id: `expand-elasticsearch-plain${productId}`,
        name: `${product}: Expand`,
        tags: ['Splunk'],
        parameters: [
            {
                name: 'ref',
                inputType: 'pivotCombo',
                label: 'Any entity in:'
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
                    '{\n' +
                    '  "query": {\n' +
                    '    "exists": { "field" : "EventID" }\n' +
                    '  }\n' +
                    '}'
            },
            {
                name: 'index',
                inputType: 'text',
                label: 'Index:',
                placeholder: 'grfy-*',
                defaultValue: 'grfy-*'
            },
            {
                name: 'filter',
                inputType: 'textarea',
                label: 'Filter:',
                placeholder: 'index=*',
                defaultValue: ''
            },
            {
                name: 'pivotFields',
                inputType: 'multi',
                label: 'Expand on:',
                placeholder: '(all)',
                options: FIELDS.map(x => ({ id: x, name: x }))
            },
            {
                name: 'matchAttributes',
                inputType: 'bool',
                label: 'Expand on attributes',
                defaultValue: false
            },
            {
                name: 'colMatch',
                inputType: 'bool',
                label: 'Match column name',
                defaultValue: false
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
        toES: function(
            {
                ref,
                query,
                index,
                pivotFields = { value: [] },
                fields = { value: [] },
                filter = '',
                filterPost = '',
                colMatch = false,
                matchAttributes = false
            },
            pivotCache = {},
            { time } = {}
        ) {
            log.info('PARAMS', colMatch, matchAttributes);

            const expanded = expand({
                pivotCache,
                filter,
                filterPost,
                colMatch,
                matchAttributes,
                pivotIds: ref.value || [],
                pivotFields: pivotFields.value || [],
                fields: fields.value || []
            });

            this.connections = fields.value;
            const _query = {
                index: index,
                type: 'event',
                body: JSON.parse(query)
            };

            console.log(expanded.keys());
            if (this.connections !== null) {
                _query['_source'] = {
                    includes: this.connections
                };
            } else if (expanded !== {} && this.connections !== null) {
                _query['_source'] = {
                    includes: expanded.keys().concat(this.connections)
                };
            } else if (expanded !== {}) {
                _query['_source'] = {
                    includes: expanded.keys()
                };
            }
            _query['_source']['excludes'] = filter;

            log.info('Expansion query', _query);

            return {
                searchQuery: _query,
                searchParams: this.dayRangeToSplunkParams((time || {}).value, time)
            };
        },
        encodings
    });
}

export const pivots = Object.values(products).map(expandPivot);

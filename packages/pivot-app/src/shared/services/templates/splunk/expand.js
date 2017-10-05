import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);


import { defaultFields as FIELDS } from './settings.js';
import { SplunkPivot } from './splunkPivot.js';
import { encodings } from './settings.js';
import { products } from './vendors';

    

//remove line breaks and escape double quotes
// a -> str
function clean(vRaw) {
    if (vRaw === undefined || vRaw === null) { return ''; }
    return String(vRaw).replace(/([\r\n])/gm,"").replace(/"/g,'\\"').trim();
}

//only do splunk searches on non-empty vals
// str -> bool
function valid(v) {
    return v.length && v !== '""';
}


function addNodeByKey(hash, k, vRaw) {

    const v = clean(vRaw);
    if (!valid(v)) { return; }

    if (!hash[k]) {
        hash[k] = {[v]: true};
    } else {
        const bin = hash[k];
        if (!bin[v]) {
            bin[v] = true;
        }
    }
}

function addNodeByVal(hash, k, vRaw) {

    const v = clean(vRaw);
    if (!valid(v)) { return; }

    if (!hash[v]) {
        hash[v] = true;
    }
}


// Use all fields if a field is "*", or fields empty
// ... -> str
export function expand({pivotIds=[], pivotCache={}, fields=[], filter='', filterPost='', colMatch=true, matchAttributes=true}) {


    log.info('EXPAND RECV', {colMatch, matchAttributes});

    const isAllFields = !fields.length || fields.filter((fld) => fld === '*').length;

    //{v->bool} or {k->{v->bool}}
    const matches = {};
    const adder = colMatch ? addNodeByKey : addNodeByVal;
    const reserved = ['pointTitle', 'pointIcon', 'pointSize', 'pointColor', 'type', 'node'];
    pivotIds.forEach((pivotId)=> {
        const pivot = pivotCache[pivotId];
        pivot.results.labels.forEach((node) => {

            if (isAllFields || fields.indexOf(node.type) > -1) {
                adder(matches, node.type, node.node);
            }

            if (matchAttributes) {
                for (const fld in node) {
                    if ((isAllFields && reserved.indexOf(fld) === -1)
                        || fields.indexOf(fld) > -1) { //explicitly opt into reserved fields
                            adder(matches, fld, node[fld]);
                    }
                }
            }

        });
    });

    const match =
        colMatch ?
            Object.keys(matches).reduce(
                (acc, fld) =>
                    (acc.length ? acc + ' OR ' : '')
                    + Object.keys(matches[fld]).reduce(
                        (acc2, v) =>
                            (acc2.length ? acc2 + ' OR ' : '') + `"${fld}"="${v}"`, ''), '')
            : Object.keys(matches).reduce(
                (acc, v) =>
                    (acc.length ? acc + ' OR ' : '') + `"${v}"`, '');

    const post = filterPost && filterPost.length ? ` |  ${filterPost}` : '';

    return `${filter} ${match} | head 10000 ${post}`;

}



function expandPivot({product, productIdentifier, desiredEntities, desiredAttributes}) {

    const productId = product === 'Splunk' ? '' : '-' + product.replace(/ /g,'');

    return new SplunkPivot({
        id: `expand-splunk-plain${productId}`,
        name: `${product}: Expand`,
        tags: ['Splunk'],
        parameters: [
            {
                name: 'ref',
                inputType: 'pivotCombo',
                label: 'Any entity in:',
            },
            {
                name: 'filter',
                inputType: 'textarea',
                label: 'Filter:',
                placeholder: 'index=*',
                defaultValue: '',
            },
            {
                name: 'filterPost',
                inputType: 'textarea',
                label: 'Filter (post):',
                placeholder: 'head 10',
                defaultValue: '',
            },
            {
                name: 'pivotFields',
                inputType: 'multi',
                label: 'Expand on:',
                placeholder: '(all)',
                options: FIELDS.map(x => ({id:x, name:x})),
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
        toSplunk: function (
                {ref, pivotFields = {value: []}, fields = {value: []}, filter = '', filterPost = '', colMatch = false, matchAttributes = false},
                pivotCache = {}, { time } = {}) {

            log.info('PARAMS', colMatch, matchAttributes);

            this.connections = fields.value;

            const indexFilter =
                Object.keys(productIdentifier || {})
                    .map((key) => ` "${key}"="${productIdentifier[key]}" `)
                    .join(' AND ');


            const expanded = expand({
                pivotCache, filter, filterPost, colMatch, matchAttributes,
                pivotIds: ref.value || [],
                fields: pivotFields.value || []});

            const query = `search ${indexFilter}${expanded} ${this.constructFieldString()}`;

            log.info('Expansion query', query);

            return {
                searchQuery: query,
                searchParams: this.dayRangeToSplunkParams((time||{}).value, time)
            };
        },
        encodings
    });
}

export const pivots = Object.values(products).map(expandPivot);
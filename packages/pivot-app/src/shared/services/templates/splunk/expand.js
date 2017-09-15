import logger from '../../../logger.js';
const log = logger.createLogger(__filename);


import { defaultFields as FIELDS } from './settings.js';
import { SplunkPivot } from './splunkPivot.js';
import { desiredAttributes, encodings } from './settings.js';



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
export function expand({pivotIds=[], pivotCache={}, fields=[], filter='', colMatch=true, matchAttributes=true}) {


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

    return `${filter} ${match} | head 10000 `;

}



export const expandSplunk = new SplunkPivot({
    id: 'expand-splunk-plain',
    name: 'Expand Splunk',
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
            options: desiredAttributes.map(x => ({id:x, name:x})),
            defaultValue: []
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
            {ref, pivotFields = {value: []}, fields = {value: []}, filter = '', colMatch = false, matchAttributes = false},
            pivotCache = {}, { time } = {}) {

        log.info('PARAMS', colMatch, matchAttributes);

        this.connections = fields.value;

        const expanded = expand({
            pivotCache, filter, colMatch, matchAttributes,
            pivotIds: ref.value || [],
            fields: pivotFields.value || []});

        const query = `search ${expanded} ${this.constructFieldString()}`;

        log.info('Expansion query', query);

        return {
            searchQuery: query,
            searchParams: this.dayRangeToSplunkParams((time||{}).value, time)
        };
    },
    encodings
});

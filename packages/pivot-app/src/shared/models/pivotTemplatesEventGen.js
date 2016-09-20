import { expandTemplate, constructFieldString } from '../services/support/splunkMacros.js';

const SPLUNK_INDICES = {
    //EVENT_GEN: 'index=event_gen | search source="eventGen100k.csv" | search sourcetype="csv" | search'
    EVENT_GEN: 'index=event_gen'
}

const SEARCH_SPLUNK_EVENT_GEN = {
    name: 'Search Splunk (event gen)',
    label: 'Query',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function(pivots, app, fields, pivotCache) {
            return `search ${SPLUNK_INDICES.EVENT_GEN} ${fields['Search']}
            | rename _cd AS EventID
            | fields - _*
            | head 100`
            //return `search ${SPLUNK_INDICES.EVENT_GEN} ${fields['Search']} | head 1000 | fields - _*`
        }
    }
}

const EXPAND_SEARCH_PALO_ALTO = {
    name: 'Expand Palo Alto Search',
    label: 'Query',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function(pivots, app, fields, pivotCache) {
            const rawSearch = `[${fields['Search']}] -[url]-> [${SPLUNK_INDICES.EVENT_GEN}]`
            return `search ${expandTemplate(rawSearch, pivotCache)} ${constructFieldString(this.fields)}`;
        },
        fields: [
            'url',
            'threat_name'
        ]
    }
}

const SEARCH_PALO_ALTO = {
    name: 'Search Splunk Palo Alto (event gen)',
    label: 'Query',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function(pivots, app, fields, pivotCache) {
            return `search ${SPLUNK_INDICES.EVENT_GEN} vendor="Palo Alto Networks"
            ${fields['Search']}
            | rename _cd AS EventID
            | fields - _*
            | head 100`
        },
    }
}

const SEARCH_PALO_ALTO_USER_TO_DEST = {
    name: 'Palo Alto - From User to Dest IP',
    label: 'Query',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function(pivots, app, fields, pivotCache) {
            return `search ${SPLUNK_INDICES.EVENT_GEN} vendor="Palo Alto Networks"
            ${fields['Search']}
            ${constructFieldString(this.fields)}
            | head 1000`
        },
        fields: [
            'dest',
            'src_user',
        ]
    }
}

const SEARCH_PALO_ALTO_DEST_TO_URL = {
    name: 'Palo Alto - From Dest IP to URL',
    label: 'Any Dest in',
    kind: 'button',

    transport: 'Splunk',
    splunk: {
        toSplunk: function(pivots, app, fields, pivotCache) {
            const attribs = 'dest';
            const rawSearch =
                `[{{${fields['Input']}}}] -[${attribs}]-> [${SPLUNK_INDICES.EVENT_GEN}]`;
            return `search ${expandTemplate(rawSearch, pivotCache)} ${constructFieldString(this.fields)} | head 100`;
        },
        fields: [
            'dest',
            'url'
        ]
    }
}

const SEARCH_PALO_ALTO_DEST_TO_THREAT = {
    name: 'Palo Alto - From Dest IP to Threat Name',
    label: 'Query',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function(pivots, app, fields, pivotCache) {
            return `search ${SPLUNK_INDICES.EVENT_GEN} vendor="Palo Alto Networks"
            ${fields['Search']}
            ${constructFieldString(this.fields)}
            | head 1000`
        },
    }
}

const SEARCH_PALO_ALTO_DEST_TO_SRC = {
    name: 'Palo Alto - From Dest IP to Src IP',
    label: 'Any Dest IP in',
    kind: 'button',

    transport: 'Splunk',
    splunk: {
        toSplunk: function(pivots, app, fields, pivotCache) {
            const attribs = 'dest';
            const rawSearch =
                `[{{${fields['Input']}}}] -[${attribs}]-> [${SPLUNK_INDICES.EVENT_GEN}]`;
            return `search ${expandTemplate(rawSearch, pivotCache)} ${constructFieldString(this)}`;
        },
        fields: [
            'dest',
            'src'
        ],
    }
}

export default [
    SEARCH_SPLUNK_EVENT_GEN, SEARCH_PALO_ALTO, SEARCH_PALO_ALTO_USER_TO_DEST,
    SEARCH_PALO_ALTO_DEST_TO_URL, SEARCH_PALO_ALTO_DEST_TO_SRC,
    SEARCH_PALO_ALTO_DEST_TO_THREAT, EXPAND_SEARCH_PALO_ALTO
]

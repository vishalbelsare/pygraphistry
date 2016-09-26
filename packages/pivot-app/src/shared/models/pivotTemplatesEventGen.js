import { expandTemplate, constructFieldString } from '../services/support/splunkMacros.js';

const SPLUNK_INDICES = {
    //EVENT_GEN: 'index=event_gen | search source="eventGen100k.csv" | search sourcetype="csv" | search'
    EVENT_GEN: 'index=event_gen',
    PAN: 'index=event_gen | search vendor="Palo Alto Networks"'
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

const PAN_SEARCH_TO_USER_DEST = {
    name: 'PAN - From search to user/dest',
    label: 'Query',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function(pivots, app, fields, pivotCache) {
            return `search ${SPLUNK_INDICES.PAN} ${fields['Search']}
                ${constructFieldString(this)}
                | head 100`;
            //return `search ${SPLUNK_INDICES.EVENT_GEN} ${fields['Search']} | head 1000 | fields - _*`
        },
        connections: [
            'user',
            'dest'
        ],
        attributes: [
            'action',
        ]
    }
};

const PAN_SEARCH_TO_USER_THREAT = {
    name: 'PAN - From search to user/threat',
    label: 'Query',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function(pivots, app, fields, pivotCache) {
            return `search ${SPLUNK_INDICES.PAN} ${fields['Search']}
                ${constructFieldString(this)}
                | head 100`;
            //return `search ${SPLUNK_INDICES.EVENT_GEN} ${fields['Search']} | head 1000 | fields - _*`
        },
        connections: [
            'user',
            'threat_name'
        ],
        attributes: [
            'severity',
            'action'
        ]
    }
};

const PAN_SEARCH_TO_USER_DEST_GROUPED = {
    name: 'PAN - From search to user/dest (grouped)',
    label: 'Query',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function(pivots, app, fields, pivotCache) {
            const search = fields['Search'];
            return `search ${SPLUNK_INDICES.PAN} | search ${search} |  stats count, min(_time), max(_time) values(dest_port) by dest user |
                 convert ctime(min(_time)) as startTime, ctime(max(_time)) as endTime | rename _cd as EventID | fields  - _*, min(_time), max(_time)`;
        },
        connections: [
            'dest',
            'user'
        ],
        attributes: [
            'count',
            'startTime',
            'endTime',
            'values(dest_port)'
        ]
    }
};

const PAN_USER_TO_THREAT = {
    name: 'PAN - From user to threat',
    label: 'Query',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function(pivots, app, fields, pivotCache) {
            const index = fields['Search'];
            const subsearch = `(severity="critical" OR severity="medium" OR severity="low") [| loadjob ${pivotCache[index].splunkSearchID} |  fields user | dedup user]`;
            return `search ${SPLUNK_INDICES.PAN} | search ${subsearch} ${constructFieldString(this)}`;
        },
        connections: [
            'user',
            'threat_name'
        ],
        attributes: [
            'action',
            'severity',
            'url',
        ]
    }
}

const PAN_DEST_TO_USER = {
    name: 'PAN - From dest to user',
    label: 'Query',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function(pivots, app, fields, pivotCache) {
            const index = fields['Search'];
            const subsearch = `[| loadjob ${pivotCache[index].splunkSearchID} |  fields dest | dedup dest]`;
            return `search ${SPLUNK_INDICES.PAN} | search ${subsearch} ${constructFieldString(this)}`;
        },
        connections: [
            'dest',
            'user'
        ],
        attributes: [
            'action',
            'count',
            'startTime',
            'endTime',
            'values(dest_port)'
        ]
    }
}

const PAN_DEST_TO_USER_GROUPED = {
    name: 'PAN - From dest to user (grouped)',
    label: 'Query',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function(pivots, app, fields, pivotCache) {
            const index = fields['Search'];
            const subsearch = `[| loadjob ${pivotCache[index].splunkSearchID} |  fields dest | dedup dest]`;
            return `search ${SPLUNK_INDICES.PAN} | search ${subsearch} |  stats count, min(_time), max(_time) values(dest_port) by dest user |
                 convert ctime(min(_time)) as startTime, ctime(max(_time)) as endTime | fields  - _*, min(_time), max(_time)`;
        },
        connections: [
            'dest',
            'user'
        ],
        attributes: [
            'count',
            'startTime',
            'endTime',
            'values(dest_port)'
        ]
    }
};

const PAN_DEST_TO_SRC_GROUPED = {
    name: 'PAN - From dest to src (grouped)',
    label: 'Query',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function(pivots, app, fields, pivotCache) {
            const index = fields['Search'];
            const subsearch = `[| loadjob ${pivotCache[index].splunkSearchID} |  fields dest | dedup dest}]`;
            return `search ${SPLUNK_INDICES.PAN} | search ${subsearch} |  stats count, min(_time), max(_time) values(dest_port) by dest src |
                 convert ctime(min(_time)) as startTime, ctime(max(_time)) as endTime | fields  - _*, min(_time), max(_time)`;
        },
        connections: [
            'dest',
            'user'
        ],
        attributes: [
            'count',
            'startTime',
            'endTime',
            'values(dest_port)'
        ]
    }
};

export default [
    PAN_SEARCH_TO_USER_DEST, PAN_DEST_TO_USER, PAN_DEST_TO_USER_GROUPED,
    PAN_SEARCH_TO_USER_DEST_GROUPED, PAN_DEST_TO_SRC_GROUPED, PAN_SEARCH_TO_USER_THREAT,
    PAN_USER_TO_THREAT
]

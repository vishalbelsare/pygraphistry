import { expandTemplate, constructFieldString } from '../services/support/splunkMacros.js';

const SPLUNK_INDICES = {
    //EVENT_GEN: 'index=event_gen | search source="eventGen100k.csv" | search sourcetype="csv" | search'
    EVENT_GEN: 'index=event_gen',
    PAN: 'index=event_gen | search vendor="Palo Alto Networks"'
}

const PAN_NODE_COLORS = {
    'EventID': 7,
    'user': 1,
    'dest': 3,
    'threat_name': 5,
}

const PAN_NODE_SIZES = {
    'EventID': 0.1,
    'dest': 1.1,
    'user': 5,
    'threat_name': 10
}

const PAN_ENCODINGS = {
    point: {
        pointColor: function(node) {
            node.pointColor = PAN_NODE_COLORS[node.type];
        },
        pointSizes: function(node) {
            node.pointSize = PAN_NODE_SIZES[node.type];
        }
    }
}

const SEARCH_SPLUNK_EVENT_GEN = {
    name: 'Search Splunk (event gen)',
    label: 'Query',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function(pivotParameters, pivotCache) {
            return `search ${SPLUNK_INDICES.EVENT_GEN} ${pivotParameters['input']}
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
        toSplunk: function(pivotParameters, pivotCache) {
            return `search ${SPLUNK_INDICES.PAN} ${pivotParameters['input']}
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
            'time'
        ]
    }
};

const PAN_SEARCH_TO_USER_THREAT = {
    name: 'PAN - From search to user/threat',
    label: 'Query',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function(pivotParameters, pivotCache) {
            return `search ${SPLUNK_INDICES.PAN} ${pivotParameters['input']}
                ${constructFieldString(this)}
                | head 100`;
            //return `search ${SPLUNK_INDICES.EVENT_GEN} ${fields['Search']} | head 1000 | fields - _*`
        },
        connections: [
            'user',
            'threat_name'
        ],
        attributes: [
            'vendor_action',
            'category',
            'time',
            'url',
            'severity',
            'action'
        ],
        encodings: PAN_ENCODINGS
    }
};

const PAN_SEARCH_TO_USER_DEST_GROUPED = {
    name: 'PAN - From search to user/dest (grouped)',
    label: 'Query',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function(pivotParameters, pivotCache) {
            const search = pivotParameters['input'];
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
        toSplunk: function(pivotParameters, pivotCache) {
            const index = pivotParameters['input'];
            const subsearch = `(severity="critical" OR severity="medium" OR severity="low") [| loadjob "${pivotCache[index].splunkSearchID}" |  fields user | dedup user]`;
            return `search ${SPLUNK_INDICES.PAN} | search ${subsearch} ${constructFieldString(this)}`;
        },
        connections: [
            'user',
            'threat_name'
        ],
        attributes: [
            'vendor_action',
            'time',
            'action',
            'category',
            'severity',
            'url',
        ],
        encodings: PAN_ENCODINGS
    }
}

const PAN_DEST_TO_USER = {
    name: 'PAN - From dest to user',
    label: 'Query',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function(pivotParamenters) {
            const index = fields['input'];
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
        toSplunk: function(pivotParameters, pivotCache) {
            const index = pivotParameters['Search'];
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
        toSplunk: function(pivotParameters, pivotCache) {
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

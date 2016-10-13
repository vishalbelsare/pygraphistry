import { expandTemplate, constructFieldString } from '../services/support/splunkMacros.js';
import { searchSplunk } from '../services/searchSplunk.js';
import { shapeSplunkResults} from '../services/shapeSplunkResults.js';
import { categoryToColorInt, intToHex } from '../services/support/palette.js';
import _ from 'underscore';

//TODO how to dynamically lookup?
// {int -> [ { ... } ]
var pivotCache = {};
class SplunkPivot {
    constructor( pivotDescription ) {
        let { name, label, kind, toSplunk, connections, encodings, fields } = pivotDescription
        this.name = name;
        this.label = label;
        this.kind = kind;
        this.toSplunk = toSplunk;
        this.connections = connections;
        this.encodings = encodings;
        this.fields = fields;
    }

    searchAndShape({app, pivot, rowId}) {

        pivot.searchQuery = this.toSplunk(pivot.pivotParameters, pivotCache);

        const splunkResults = searchSplunk({app, pivot})
            .do(({pivot}) => {
                pivotCache[pivot.id] = { results: pivot.results,
                    query:pivot.searchQuery,
                    splunkSearchID: pivot.splunkSearchID
                };
            })

        return shapeSplunkResults(splunkResults, pivot.pivotParameters, pivot.id, this, pivot.rowId)
            .map(({app, pivot}) => {
                pivot.status = { ok: true };
                return { app, pivot }
        });
    }
}

const SPLUNK_INDICES = {
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
};

const PAN_SHAPES = {
    userToThreat: {
        connections: [ 'user', 'threat_name'],
        attributes: ['vendor_action', 'category', 'time', 'url', 'severity',
                            'action']
    },
    userToDest: {
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
    },
    searchUserToDest: {
        connections: [
            'user',
            'dest'
        ],
        attributes: [
            'action',
            'time'
        ]
    }
}

const PAN_SEARCH = {
    name: 'PAN - From search to user/threat',
    label: 'Query',
    kind: 'text',
    toSplunk: function(pivotParameters, pivotCache) {
        return `search ${SPLUNK_INDICES.PAN} ${pivotParameters['input']}
                ${constructFieldString(this)}
                | head 100`;
    },
};

const PAN_EXPAND_USER = {
    name: 'PAN - From user to threat',
    label: 'Expand on ',
    kind: 'button',
    toSplunk: function(pivotParameters, pivotCache) {
        const subSearchId = pivotParameters['input'];
        const isGlobalSearch = (subSearchId === '*');
        var subsearch = '';
        if (isGlobalSearch) {
            const list  = _.map(Object.keys(pivotCache), (pivotId) => (`[| loadjob "${pivotCache[pivotId].splunkSearchID}" | fields user | dedup user]`));
            subsearch = list.join(' | append ');
        } else {
            subsearch = `[| loadjob "${pivotCache[subSearchId].splunkSearchID}" |  fields user | dedup user]`
        }

        return `search ${SPLUNK_INDICES.PAN}
                    | search (severity="critical" OR severity="medium" OR severity="low") ${subsearch} ${constructFieldString(this)}`;
    }
}

const PAN_DEST_USER_DICT = {
    name: 'PAN - From dest to user',
    label: 'Expand on ',
    kind: 'button',

    toSplunk: function(pivotParameters, pivotCache) {
        const index = pivotParameters['input'];
        const subsearch = `[| loadjob "${pivotCache[index].splunkSearchID}" |  fields dest | dedup dest]`;
        return `search ${SPLUNK_INDICES.PAN} | search ${subsearch} ${constructFieldString(this)}`;
    }
}

const PAN_SEARCH_USER_DEST_DICT = {
    name: 'PAN - From search to user/dest',
    label: 'Query',
    kind: 'text',
    toSplunk: function(pivotParameters, pivotCache) {
            return `search ${SPLUNK_INDICES.PAN} ${pivotParameters['input']}
                ${constructFieldString(this)}
                | head 100`;
            //return `search ${SPLUNK_INDICES.EVENT_GEN} ${fields['Search']} | head 1000 | fields - _*`
    }
};

const PAN_SEARCH_TO_USER_THREAT = new SplunkPivot({...PAN_SEARCH, ...PAN_SHAPES.userToThreat, encodings: PAN_ENCODINGS});
const PAN_USER_TO_THREAT = new SplunkPivot({...PAN_EXPAND_USER, ...PAN_SHAPES.userToThreat, encodings: PAN_ENCODINGS});
const PAN_SEARCH_USER_DEST= new SplunkPivot({...PAN_SEARCH_USER_DEST_DICT, ...PAN_SHAPES.userToDest, encodings: PAN_ENCODINGS});
const PAN_DEST_USER = new SplunkPivot({...PAN_DEST_USER_DICT, ...PAN_SHAPES.userToDest, encodings: PAN_ENCODINGS});

export default [
    PAN_SEARCH_USER_DEST, PAN_DEST_USER,
    PAN_SEARCH_TO_USER_THREAT,
    PAN_USER_TO_THREAT
]

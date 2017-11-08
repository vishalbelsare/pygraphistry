import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);

import { SplunkPivot } from '../splunkPivot';
import { attributesBlacklist as splunkAttributesBlacklist, encodings } from '../settings.js';

const splunkIndices = {
    FIREEYE: '"Alert Category"="Fire Eye" index="alert_graph_demo"',
    BLUECOAT: '"Alert Category"="Blue Coat Proxy" index="alert_graph_demo"',
    FIREWALL: '"Alert Category"="Firewall" index="alert_graph_demo"',
    IDS: '"Alert Category"="IDS/IPS" index="alert_graph_demo"',
    ALL: 'index=alert_graph_demo'
};

const badFields = [];
for (let i = 0; i < 30; i++) {
    badFields.push('field' + i);
}
const attributesBlacklist = splunkAttributesBlacklist.concat(badFields);

const FIELDS = [`EventID`, `fileHash`, `dest_hostname`, `src_ip`, `dst_ip`, `dest_ip`, `msg`];

//===================

const renames = `
    | rename "Fire Eye URL" -> dest_hostname 
    | rename "Fire Eye MD5" -> fileHash 
    | rename "Internal IPs" -> src_ip
    | rename "External IPs" -> dest_ip
    | rename "Message" -> msg
`;

const extraSearch = {
    'FIREEYE': '| eval dest_ip="66.96.146.129"'
};

const extraExpand = {
    'FIREEYE': '| eval dest_ip="66.96.146.129"'
}


function makeSearchIndex(indexName) {
    return function(args, pivotCache, { time } = {}) {
        const query = `search EventID=${args.event} ${splunkIndices[
            indexName
        ]} ${this.constructFieldString()} ${renames} ${extraSearch[indexName]||''}`;

        return {
            searchQuery: query,
            searchParams: this.dayRangeToSplunkParams((args.time || {}).value, time)
        };
    };
}

function makeExpandIndex(indexName) {
    return function(args, pivotCache = {}, { time } = {}) {
        const refPivot = args.ref.value;
        const rawSearch = `[{{${refPivot}}}] -[${args.fields.value.join(', ')}]-> [${splunkIndices[
            indexName
        ]}]`;
        const query = `search ${this.expandTemplate(
            rawSearch,
            pivotCache,
            false
        )} ${this.constructFieldString()} ${renames} ${extraExpand[indexName]||''}`;

        return {
            searchQuery: query,
            searchParams: this.dayRangeToSplunkParams((args.time || {}).value, time)
        };
    };
}

//===================

export const searchFireeyeDemo = new SplunkPivot({
    id: 'search-splunk-fireeye-botnet-demo',
    name: 'Search FireEye',
    tags: ['Demo'],
    parameters: [
        {
            name: 'event',
            inputType: 'text',
            label: 'EventId:',
            placeholder: 'BRO8ZA4A'
        },
        {
            name: 'time',
            label: 'Time',
            inputType: 'daterange',
            default: { from: null, to: null }
        }
    ],
    connections: FIELDS,
    attributesBlacklist: attributesBlacklist,
    encodings,
    toSplunk: makeSearchIndex('FIREEYE')
});

function makeExpandPivot(id, index, name, connections = FIELDS) {
    return new SplunkPivot({
        id,
        name,
        tags: ['Demo'],
        parameters: [
            {
                name: 'ref',
                inputType: 'pivotCombo',
                label: 'Any field in:'
            },
            {
                name: 'fields',
                inputType: 'multi',
                label: 'Expand on:',
                options: FIELDS.map(x => ({ id: x, name: x }))
            },
            {
                name: 'time',
                label: 'Time',
                inputType: 'daterange',
                default: { from: null, to: null }
            }
        ],
        connections,
        attributesBlacklist,
        encodings,
        toSplunk: makeExpandIndex(index)
    });
}

const expandFireeyeDemo = makeExpandPivot(
    'expand-fireeye-botnet-demo',
    'FIREEYE',
    'Expand with FireEye'
);

const expandBlueCoatDemo = makeExpandPivot(
    'expand-bluecoat-botnet-demo',
    'BLUECOAT',
    'Expand with Blue Coat',
    ['dest_hostname', 'dest_ip']
);

const expandFirewallDemo = makeExpandPivot(
    'expand-firewall-botnet-demo',
    'FIREWALL',
    'Expand with Firewall',
    ['dest_ip', 'src_ip']
);

const expandIDSDemo = makeExpandPivot('expand-ids-botnet-demo', 'IDS', 'Expand with IDS/IPS', [
    'src_ip',
    'msg'
]);

export const pivots = [
    searchFireeyeDemo,
    expandFireeyeDemo,
    expandBlueCoatDemo,
    expandFirewallDemo,
    expandIDSDemo
];

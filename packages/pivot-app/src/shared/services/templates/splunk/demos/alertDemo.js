import stringhash from 'string-hash';
import logger from '../../../../logger';
const log = logger.createLogger(__filename);

import { SplunkPivot } from '../splunkPivot';
import { attributesBlacklist as splunkAttributesBlacklist } from '../settings.js';



const splunkIndices = {
    FIREEYE: '"Alert Category"="Fire Eye" index="alert_graph_demo"',
    BLUECOAT: '"Alert Category"="Blue Coat Proxy" index="alert_graph_demo"',
    FIREWALL: '"Alert Category"="Firewall" index="alert_graph_demo"',
    IDS: '"Alert Category"="IDS/IPS" index="alert_graph_demo"',
    ALL: 'index=alert_graph_demo'
};

const ALERT_DEMO_NODE_COLORS = {
    'Host': 0,
    'Internal IPs': 1,
    'User': 2,
    'External IPs': 3,
    'Fire Eye MD5': 4,
    'Message': 5,
    'Fire Eye URL': 6,
    'EventID': 7,
    'Search': 8
};

const ALERT_DEMO_NODE_SIZES = {
    'Host': 9.9,
    'Internal IPs': 9.9,
    'Fire Eye Source IP': 9.9,
    'External IPs': 9.9,
    'User': 9.9,
    //    'AV Alert Name':5.1,
    'Fire Eye MD5': 9.9,
    //'Fire Eye Alert Name':10.1,
    'Fire Eye URL': 9.9,
    'Message': 9.9,
    'EventID':0.1,
    'Search': 9.9,
};


const ALERT_DEMO_NODE_ICONS = {
    'Host': 'globe',
    'Internal IPs': 'laptop',
    'User': 'user',
    'External IPs': 'user-secret',
    'Fire Eye MD5': 'hashtag',
    'Message': 'bell',
    'Fire Eye URL': 'globe',
    'EventID': 'exclamation-circle',
    'Search': 'search'
};


const badFields = [];
for (let i = 0; i < 30; i++) { badFields.push('field' + i); }
const attributesBlacklist = splunkAttributesBlacklist.concat(badFields);

const alertDemoEncodings = {
    point: {
        pointColor: function(node) {
            node.pointColor = ALERT_DEMO_NODE_COLORS[node.type];
            if (node.pointColor === undefined) {
                node.pointColor = stringhash(node.type) % 12;
            }
        },
        pointSizes: function(node) {
            node.pointSize = ALERT_DEMO_NODE_SIZES[node.type];
        },
        pointIcon: function (node) {
            node.pointIcon = ALERT_DEMO_NODE_ICONS[node.type];
            if (node.pointIcon === undefined) {
                node.pointIcon = 'fw';
            }
        }
    }
}

const FIREEYE_FIELDS = [
    `Fire Eye MD5`,
    `Fire Eye URL`,
    `Internal IPs`,
    `Message`,
];

const FIELDS = [
    `Fire Eye MD5`,
    `Fire Eye URL`,
    `Internal IPs`,
    'External IPs',
    'Message'
];

export const searchAlertDemo = new SplunkPivot({
    id: 'search-splunk-alert-botnet-demo',
    name: 'Search Botnet (all)',
    tags: ['Demo'],
    parameters: [
        {
            name: 'query',
            inputType: 'text',
            label: 'Query:',
            placeholder: 'Conficker'
        },
        {
            name: 'time',
            label: 'Time',            
            inputType: 'daterange',
            default: { from: null, to: null }
        }
    ],
    toSplunk: function (args, pivotCache = {}, { time } = {}) {
        const query = `search ${splunkIndices.ALL} ${args.query}`;

        return {
            searchQuery: query,
            searchParams: this.dayRangeToSplunkParams((args.time||{}).value, time)
        };
    },
    encodings: alertDemoEncodings
});


//===================

function makeSearchIndex (indexName) {
    return function (args, pivotCache = {}, { time } = {}) {
        const query = `search EventID=${args.event} ${splunkIndices[indexName]} ${this.constructFieldString()}`;

        return {
            searchQuery: query,
            searchParams: this.dayRangeToSplunkParams((args.time||{}).value, time)
        };
    }; 
}

function makeExpandIndex (indexName) {
    return function (args, pivotCache = {}, { time } = {}) {
        const refPivot = args.ref.value;
        const rawSearch =
            `[{{${refPivot}}}] -[${args.fields.value.join(', ')}]-> [${splunkIndices[indexName]}]`;
        const query = `search ${this.expandTemplate(rawSearch, pivotCache)} ${this.constructFieldString()}`;

        return {
            searchQuery: query,
            searchParams: this.dayRangeToSplunkParams((args.time||{}).value, time)
        };
    };
}

const EXPAND_PARAMS = [
        {
            name: 'ref',
            inputType: 'pivotCombo',
            label: 'Any field in:',
        },
        {
            name: 'fields',
            inputType: 'multi',
            label: 'Expand on:',
            options: FIELDS.map(x => ({id:x, name:x})),
        },
        {
            name: 'time',
            label: 'Time',            
            inputType: 'daterange',
            default: { from: null, to: null }
        }
    ];

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
    connections: FIREEYE_FIELDS,
    attributesBlacklist: attributesBlacklist,    
    encodings: alertDemoEncodings,
    toSplunk: makeSearchIndex('FIREEYE')
});

export const expandFireeyeDemo = new SplunkPivot({
    id: 'expand-fireeye-botnet-demo',
    name: 'Expand with FireEye',
    tags: ['Demo'],
    parameters: EXPAND_PARAMS,
    connections: FIREEYE_FIELDS,
    attributesBlacklist: attributesBlacklist,    
    encodings: alertDemoEncodings,
    toSplunk: makeExpandIndex('FIREEYE')
});

export const expandBlueCoatDemo = new SplunkPivot({
    id: 'expand-bluecoat-botnet-demo',
    name: 'Expand with Blue Coat',
    tags: ['Demo'],
    parameters: EXPAND_PARAMS,
    connections: [ 'Fire Eye URL', 'External IPs' ],
    attributesBlacklist: attributesBlacklist,    
    encodings: alertDemoEncodings,
    toSplunk: makeExpandIndex('BLUECOAT')
});

export const expandFirewallDemo = new SplunkPivot({
    id: 'expand-firewall-botnet-demo',
    name: 'Expand with Firewall',
    tags: ['Demo'],
    parameters: EXPAND_PARAMS,
    connections: [ 'External IPs', 'Internal IPs' ],
    attributesBlacklist: attributesBlacklist,    
    encodings: alertDemoEncodings,
    toSplunk: makeExpandIndex('FIREWALL')
});

export const expandIDSDemo = new SplunkPivot({
    id: 'expand-ids-botnet-demo',
    name: 'Expand with IDS/IPS',
    tags: ['Demo'],
    parameters: EXPAND_PARAMS,
    connections: [ 'Internal IPs', 'Message' ],
    attributesBlacklist: attributesBlacklist,    
    encodings: alertDemoEncodings,
    toSplunk: makeExpandIndex('IDS')
});

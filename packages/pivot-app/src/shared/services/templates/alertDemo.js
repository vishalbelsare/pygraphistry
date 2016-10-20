import { expandTemplate, constructFieldString, SplunkPivot } from '../services/support/splunkMacros.js';
import stringhash from 'string-hash';


const SPLUNK_INDICES = {
    FIREEYE: '"Alert Category"="Fire Eye" index="alert_graph_demo"',
    BLUECOAT: '"Alert Category"="Blue Coat Proxy" index="alert_graph_demo"',
    FIREWALL: '"Alert Category"="Firewall" index="alert_graph_demo"',
    ALL: 'index=alert_graph_demo'
};

const SEARCH_SPLUNK_ALERT = new SplunkPivot({
    name: 'Search Splunk (alerts)',
    label: 'Query:',
    kind: 'text',
    splunk: {
        toSplunk: function (pivotParameters, pivotCache) {
            return `search ${SPLUNK_INDICES.ALL} ${pivotParameters.input}`
        }
    }
});

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
    'Host':1.0,
    'Internal IPs':1.5,
    'Fire Eye Source IP': 10.1,
    'External IPs':1.5,
    'User':0.5,
    //    'AV Alert Name':5.1,
    'Fire Eye MD5':10.1,
    //'Fire Eye Alert Name':10.1,
    'Fire Eye URL':2.1,
    'Message': 7.1,
    'EventID':0.1,
    'Search': 1,
};

const ALERT_DEMO_ENCODINGS = {
    point: {
        pointColor: function(node) {
            node.pointColor = ALERT_DEMO_NODE_COLORS[node.type];
            if (node.pointColor === undefined) {
                node.pointColor = stringhash(node.type) % 12;
            }
        },
        pointSizes: function(node) {
            node.pointSize = ALERT_DEMO_NODE_SIZES[node.type];
        }
    }
}

const FIREEYE_FIELDS = [
    `Fire Eye MD5`,
    `Fire Eye URL`,
    `Internal IPs`,
    `Message`,
]

const SEARCH_FIREEYE = new SplunkPivot({
    name: 'Search FireEye',
    label: 'EventID:',
    kind: 'text',
    connections: FIREEYE_FIELDS,
    encodings: ALERT_DEMO_ENCODINGS,

    toSplunk: function (pivotParameters, pivotCache) {
        return `search EventID=${ pivotParameters['input'] } ${SPLUNK_INDICES.FIREEYE} ${constructFieldString(this)}`;
    }
});

const FIREEYE = new SplunkPivot({
    name: 'Expand with Fire Eye',
    label: 'Any field in:',
    kind: 'button',
    connections: FIREEYE_FIELDS,
    encodings: ALERT_DEMO_ENCODINGS,

    toSplunk: function (pivotParameters, pivotCache) {
        console.log('Pivot Cache', pivotCache);
        const attribs = 'EventID, Message, Fire Eye MD5, Fire Eye URL, Internal IPs, External IPs';
        const rawSearch =
            `[{{${pivotParameters['input']}}}] -[${attribs}]-> [${SPLUNK_INDICES.FIREEYE}]`;
        return `search ${expandTemplate(rawSearch, pivotCache)} ${constructFieldString(this)}`;
    },
});

const BLUECOAT = new SplunkPivot({
    name: 'Expand with Blue Coat',
    label: 'Any URL in:',
    kind: 'button',
    connections: [ 'Fire Eye URL', 'External IPs' ],
    encodings: ALERT_DEMO_ENCODINGS,

    toSplunk: function (pivotParameters, pivotCache) {
        const attribs = 'Fire Eye URL';
        const rawSearch =
            `[{{${pivotParameters['input']}}}] -[${attribs}]-> [${SPLUNK_INDICES.BLUECOAT}]`;
        return `search ${expandTemplate(rawSearch, pivotCache)} ${constructFieldString(this)}`;
    }
});

const FIREWALL = new SplunkPivot({
    name: 'Expand with Firewall',
    label: 'Any IP in:',
    kind: 'button',
    connections: [ 'External IPs', 'Internal IPs' ],
    encodings: ALERT_DEMO_ENCODINGS,
    toSplunk: function (pivotParameters, pivotCache) {
        const attribs = 'External IPs';
        const rawSearch =
            `[{{${pivotParameters['input']}}}] -[${attribs}]-> [${SPLUNK_INDICES.FIREWALL}]`;
        return `search ${expandTemplate(rawSearch, pivotCache)} ${constructFieldString(this)}`;
    }
});

export default [
    SEARCH_SPLUNK_ALERT, SEARCH_FIREEYE, FIREEYE, BLUECOAT, FIREWALL
];

import { expandTemplate } from '../services/support/splunkMacros.js';


const SPLUNK_INDICES = {
    FIREEYE: '"Alert Category"="Fire Eye" index="alert_graph_demo"',
    BLUECOAT: '"Alert Category"="Blue Coat Proxy" index="alert_graph_demo"',
    FIREWALL: '"Alert Category"="Firewall" index="alert_graph_demo"',
    ALL: 'index=alert_graph_demo'
};

function constructFieldString(fields) {
    return ` | fields "${fields.join('" , "')}" | fields - _*`;
}

const SEARCH_SPLUNK_ALERT = {
    name: 'Search Splunk (alerts)',
    label: 'Query:',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function (pivots, app, fields, pivotCache) {
            return `EventID=${ fields['Search'] } ${SPLUNK_INDICES.ALL}`
        }
    }
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

const FIREEYE_FIELDS = [
            `EventID`,
            `Fire Eye MD5`,
            `Fire Eye URL`,
            `Internal IPs`,
            `Message`,
]

const SEARCH_FIREEYE = {
    name: 'Search FireEye',
    label: 'EventID:',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function (pivots, app, fields, pivotCache) {
            return `search EventID=${ fields['Search'] } ${SPLUNK_INDICES.FIREEYE} ${constructFieldString(this.fields)}`;
        },
        fields: FIREEYE_FIELDS,
        encodings: {
            pointColor: function(node) {
                node.pointColor = ALERT_DEMO_NODE_COLORS[node.type];
            }
        }
    }
};

const FIREEYE = {
    name: 'Expand with Fire Eye',
    label: 'Any field in:',
    kind: 'button',

    transport: 'Splunk',
    splunk: {
        toSplunk: function (pivots, app, fields, pivotCache) {
            const attribs = 'EventID, Message, Fire Eye MD5, Fire Eye URL, Internal IPs, External IPs';
            const rawSearch =
                `[{{${fields['Input']}}}] -[${attribs}]-> [${SPLUNK_INDICES.FIREEYE}]`;
            return `search ${expandTemplate(rawSearch, pivotCache)} ${constructFieldString(this.fields)}`;
        },
        fields: FIREEYE_FIELDS
    }
};

const BLUECOAT = {
    name: 'Expand with Blue Coat',
    label: 'Any URL in:',
    kind: 'button',

    transport: 'Splunk',
    splunk: {
        toSplunk: function (pivots, app, fields, pivotCache) {
            const attribs = 'Fire Eye URL';
            const rawSearch =
                `[{{${fields['Input']}}}] -[${attribs}]-> [${SPLUNK_INDICES.BLUECOAT}]`;
            return `search ${expandTemplate(rawSearch, pivotCache)} ${constructFieldString(this.fields)}`;
        },
        fields: [
            'Fire Eye URL',
            'External IPs'
        ]
    }
};

const FIREWALL = {
    name: 'Expand with Firewall',
    label: 'Any IP in:',
    kind: 'button',

    transport: 'Splunk',
    splunk: {
        toSplunk: function (pivots, app, fields, pivotCache) {
            const attribs = 'External IPs';
            const rawSearch =
                `[{{${fields['Input']}}}] -[${attribs}]-> [${SPLUNK_INDICES.FIREWALL}]`;
            return `search ${expandTemplate(rawSearch, pivotCache)} ${constructFieldString(this.fields)}`;
        },
        fields: [
            'External IPs',
            'Internal IPs'
        ]
    }
};

export default [
    SEARCH_SPLUNK_ALERT, SEARCH_FIREEYE, FIREEYE, BLUECOAT, FIREWALL
];

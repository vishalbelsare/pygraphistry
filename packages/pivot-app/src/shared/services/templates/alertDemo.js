import { SplunkPivot } from './SplunkPivot';
import stringhash from 'string-hash';


const splunkIndices = {
    FIREEYE: '"Alert Category"="Fire Eye" index="alert_graph_demo"',
    BLUECOAT: '"Alert Category"="Blue Coat Proxy" index="alert_graph_demo"',
    FIREWALL: '"Alert Category"="Firewall" index="alert_graph_demo"',
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
        }
    }
}

const FIREEYE_FIELDS = [
    `Fire Eye MD5`,
    `Fire Eye URL`,
    `Internal IPs`,
    `Message`,
]

export const searchAlertDemo = new SplunkPivot({
    id: 'search-splunk-alert-botnet-demo',
    name: 'Search Bootnet (all)',
    pivotParameterKeys: ['query'],
    pivotParametersUI: {
        query: {
            inputType: 'text',
            label: 'Query:',
            placeholder: 'Conficker'
        }
    },
    toSplunk: function (pivotParameters, pivotCache) {
        return `search ${splunkIndices.ALL} ${pivotParameters.query}`
    },
    encodings: alertDemoEncodings
});


export const searchFireeyeDemo = new SplunkPivot({
    id: 'search-splunk-fireeye-botnet-demo',
    name: 'Search FireEye',
    pivotParameterKeys: ['event'],
    pivotParametersUI: {
        event: {
            inputType: 'text',
            label: 'EventId:',
            placeholder: 'BRO8ZA4A'
        }
    },
    connections: FIREEYE_FIELDS,
    encodings: alertDemoEncodings,
    toSplunk: function (pivotParameters, pivotCache) {
        return `search EventID=${pivotParameters.event} ${splunkIndices.FIREEYE} ${this.constructFieldString()}`;
    }
});

export const expandFireeyeDemo = new SplunkPivot({
    id: 'expand-fireeye-botnet-demo',
    name: 'Expand with Fire Eye',
    pivotParameterKeys: ['ref'],
    pivotParametersUI: {
        ref: {
            inputType: 'pivotCombo',
            label: 'Any field in:',
        }
    },
    connections: FIREEYE_FIELDS,
    encodings: alertDemoEncodings,
    toSplunk: function (pivotParameters, pivotCache) {
        const attribs = 'EventID, Message, Fire Eye MD5, Fire Eye URL, Internal IPs, External IPs';
        const rawSearch =
            `[{{${pivotParameters.ref}}}] -[${attribs}]-> [${splunkIndices.FIREEYE}]`;
        return `search ${this.expandTemplate(rawSearch, pivotCache)} ${this.constructFieldString()}`;
    },
});

export const expandBlueCoatDemo = new SplunkPivot({
    id: 'expand-bluecoat-botnet-demo',
    name: 'Expand with Blue Coat',
    pivotParameterKeys: ['pivotRef'],
    pivotParametersUI: {
        pivotRef: {
            inputType: 'pivotCombo',
            label: 'Any URL in:',
        }
    },
    connections: [ 'Fire Eye URL', 'External IPs' ],
    encodings: alertDemoEncodings,
    toSplunk: function (pivotParameters, pivotCache) {
        const attribs = 'Fire Eye URL';
        const rawSearch =
            `[{{${pivotParameters.pivotRef}}}] -[${attribs}]-> [${splunkIndices.BLUECOAT}]`;
        return `search ${this.expandTemplate(rawSearch, pivotCache)} ${this.constructFieldString()}`;
    }
});

export const expandFirewallDemo = new SplunkPivot({
    id: 'expand-firewall-botnet-demo',
    name: 'Expand with Firewall',
    pivotParameterKeys: ['pRef'],
    pivotParametersUI: {
        pRef: {
            inputType: 'pivotCombo',
            label: 'Any IP in:',
        }
    },
    connections: [ 'External IPs', 'Internal IPs' ],
    encodings: alertDemoEncodings,
    toSplunk: function (pivotParameters, pivotCache) {
        const attribs = 'External IPs';
        const rawSearch =
            `[{{${pivotParameters.pRef}}}] -[${attribs}]-> [${splunkIndices.FIREWALL}]`;
        return `search ${expandTemplate(rawSearch, pivotCache)} ${this.constructFieldString()}`;
    }
});

import { expandTemplate } from '../services/support/splunkMacros.js';


const SPLUNK_INDICES = {
    FIREEYE: '"Alert Category"="Fire Eye" index="alert_graph_demo"',
    BLUECOAT: '"Alert Category"="Blue Coat Proxy" index="alert_graph_demo"',
    FIREWALL: '"Alert Category"="Firewall" index="alert_graph_demo"',
    ALL: 'index=alert_graph_demo'
};


const SEARCH_SPLUNK_ALERT = {
    name: 'Search Splunk (alerts)',
    label: 'Query:',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function (pivots, app, fields, pivotCache) {
            return `${SPLUNK_INDICES.ALL} ${ fields['Search'] }`
        }
    }
};


const SEARCH_FIREEYE = {
    name: 'Search FireEye',
    label: 'EventID:',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function (pivots, app, fields, pivotCache) {
            return `EventID=${ fields['Search'] } ${SPLUNK_INDICES.FIREEYE}`
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
            return expandTemplate(rawSearch, pivotCache);
        }
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
            return expandTemplate(rawSearch, pivotCache);
        }
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
            return expandTemplate(rawSearch, pivotCache);
        }
    }
};

export default [
    SEARCH_SPLUNK_ALERT, SEARCH_FIREEYE, FIREEYE, BLUECOAT, FIREWALL
];

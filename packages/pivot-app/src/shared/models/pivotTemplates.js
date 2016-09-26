import _ from 'underscore';

import ALERT_TEMPLATES from './pivotTemplatesAlert.js';
import HEALTH_TEMPLATES from './pivotTemplatesHealth.js';


const SEARCH_SPLUNK = {
    name: 'Search Splunk',
    label: 'Query:',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function (pivots, app, fields, pivotCache) {
            return `search ${fields['Search']} | fields - _* | head 500`
        }
    }
};

const DATASET_ERROR_NODE_COLORS = {
    'dataset': 1,
    'msg': 5,
    'EventID': 7
}

const SEARCH_SPLUNK_DATASET = {
    name: 'Search Splunk (dataset)',
    label: 'Query:',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function (pivots, app, fields, pivotCache) {
            return `search ${fields['Search']} | spath output=dataset path="metadata.dataset" | search dataset="*"  | fields msg, dataset | fields - _* | head 10`
        },
        encodings: {
            point: {
                pointColor: function(node) {
                    node.pointColor = DATASET_ERROR_NODE_COLORS[node.type];
                }
            }
        },
        links: [
            'msg',
            'dataset'
        ]
    }
};


// Map template, pivot name to pivot template dict
//{string -> string -> {pivot}}
const bindings = {};
function memoizeTemplate (templateName, templatePivots) {
    const template = _.object(templatePivots.map((x) => x.name), templatePivots);
    var binding = {};
    binding[templateName] = template;
    _.extend(bindings, binding);
    return template;
}
memoizeTemplate('splunk', [SEARCH_SPLUNK]);
memoizeTemplate('alert_demo', [SEARCH_SPLUNK].concat(ALERT_TEMPLATES))
memoizeTemplate('health_demo', [SEARCH_SPLUNK].concat(HEALTH_TEMPLATES));

memoizeTemplate('all', [SEARCH_SPLUNK, SEARCH_SPLUNK_DATASET].concat(ALERT_TEMPLATES).concat(HEALTH_TEMPLATES));


/*
{
    'templatePivotNames': string -> [string] U exn
    'get': string * string ->  -> pivot U exn
}
*/
export default {
    templatePivotNames: (templateName) => {
        if (!(templateName in bindings)) {
            throw new Error('Unknown template ' + templateName);
        }
        return Object.keys(bindings[templateName]);
    },
    get: (templateName, pivotName) => {
        if (!(templateName in bindings)) {
            throw new Error('Unknown template ' + templateName);
        }
        if (!(pivotName in bindings[templateName])) {
            throw new Error('Unknown pivot ' + pivotName);
        }
        return bindings[templateName][pivotName];
    }
};

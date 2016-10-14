import ALERT_TEMPLATES from './pivotTemplatesAlert.js';
import HEALTH_TEMPLATES from './pivotTemplatesHealth.js';
import EVENT_GEN_TEMPLATES from './pivotTemplatesEventGen.js'
import { constructFieldString, SplunkPivot } from '../services/support/splunkMacros.js';

import _ from 'underscore';
import stringhash from 'string-hash';

const SEARCH_SPLUNK = new SplunkPivot({
    name: 'Search Splunk',
    label: 'Query:',
    kind: 'text',
    toSplunk: function (pivotParameters, pivotCache) {
        return `search ${pivotParameters['input']} ${constructFieldString(this)} | head 500`;
    },
    encodings: {
        point: {
            pointColor: (node) => {
                node.pointColor = stringhash(node.type) % 12;
            }
        }
    }
});

const SEARCH_SPLUNK_MAP = {
    name: 'Splunk Map',
    label: 'Query',
    kind: 'text',

    transport: 'Splunk',
    splunk: {
        toSplunk: function(pivots, app, fields, pivotCache) {
            const [source, dest] = fields['Search'].split(',');
            console.log('Source', source, 'Dest', dest);
            const subsearch = `[| loadjob ${pivotCache[0].splunkSearchID} |  fields ${source} | dedup ${source}]`;
            return `search ${subsearch} | fields ${source}, ${dest} | dedup 10 ${source} ${dest} | fields  - _*`;
        },
        //source: 'dest',
        //dest: 'src'
    }
}

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
        toSplunk: function (pivotParameters, pivotCache) {
            return `search ${pivotParameters['input']} | spath output=dataset path="metadata.dataset" | search dataset="*"  | fields msg, dataset | fields - _* | head 10`
        },
        encodings: {
            point: {
                pointColor: function(node) {
                    node.pointColor = DATASET_ERROR_NODE_COLORS[node.type];
                    if (node.pointColor === undefined) {
                        node.pointColor = stringhash(node.type) % 12;
                    }
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
memoizeTemplate('event_gen', [SEARCH_SPLUNK].concat(EVENT_GEN_TEMPLATES));

memoizeTemplate('all', [SEARCH_SPLUNK, SEARCH_SPLUNK_DATASET, SEARCH_SPLUNK_MAP]
    .concat(ALERT_TEMPLATES)
    .concat(HEALTH_TEMPLATES)
    .concat(EVENT_GEN_TEMPLATES));


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

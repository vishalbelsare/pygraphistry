//import ALERT_TEMPLATES from './pivotTemplatesAlert.js';
//import HEALTH_TEMPLATES from './pivotTemplatesHealth.js';
//import EVENT_GEN_TEMPLATES from './pivotTemplatesEventGen.js'
//import BLAZE_TEMPLATES from './pivotTemplatesBlaze.js'
import { constructFieldString, SplunkPivot } from '../support/splunkMacros.js';

import _ from 'underscore';
import stringhash from 'string-hash';


export const searchSplunk = new SplunkPivot({
    id: '42',
    name: 'Search Splunk',
    pivotParameterKeys: ['query'],
    pivotParametersUI: {
        'query': {
            inputType: 'text',
            label: 'Query:',
            placeholder: 'error'
        }
    },
    toSplunk: function (pivotParameters, pivotCache) {
        return `search ${pivotParameters['query']} ${constructFieldString(this)} | head 500`;
    },
    encodings: {
        point: {
            pointColor: (node) => {
                node.pointColor = stringhash(node.type) % 12;
            }
        }
    }
});


export const searchSplunkMap = new SplunkPivot({
    id: 'search-splunk-source-dest',
    name: 'Search Splunk Map',
    pivotParameterKeys: ['src', 'dst', 'pivot'],
    pivotParametersUI: {
        'src': {
            inputType: 'text',
            label: 'Source:',
            placeholder: 'dataset'
        },
        'dst': {
            inputType: 'text',
            label: 'Dest:',
            placeholder: 'msg'
        },
        'pivot': {
            inputType: 'pivotCombo',
            label: 'Pivot:',
        }
    },
    toSplunk: function(pivotParameters, pivotCache) {
        console.log('PIVOTPARAMETERS', pivotParameters)
        const source = pivotParameters['src'];
        const dest = pivotParameters['dst'];
        const subsearch = `[
            | loadjob "${pivotCache[pivotParameters.pivot].splunkSearchID}"
            |  fields ${source}
            | dedup ${source}
        ]`;
        return `search ${subsearch}
            | fields ${source}, ${dest}
            | dedup 10 ${source} ${dest}
            | fields  - _*`;
    },
    encodings: {
        point: {
            pointColor: (node) => {
                node.pointColor = stringhash(node.type) % 12;
            }
        }
    }
});

const DATASET_ERROR_NODE_COLORS = {
    'dataset': 1,
    'msg': 5,
    'EventID': 7
}

export const searchGraphviz = new SplunkPivot({
    id: 'search-graphviz-logs',
    name: 'Search Graphviz Logs',
    pivotParameterKeys: ['query2'],
    pivotParametersUI: {
        'query2': {
            inputType: 'text',
            label: 'Query:',
            placeholder: 'miserables'
        }
    },
    toSplunk: function (pivotParameters, pivotCache) {
        return `search ${pivotParameters['query2']}
            | spath output=dataset path="metadata.dataset"
            | search dataset="*"
            | fields msg, dataset
            | fields - _*
            | head 100`
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
    }
});


    /*
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
memoizeTemplate('blaze', [SEARCH_SPLUNK].concat(BLAZE_TEMPLATES));

memoizeTemplate('all', [SEARCH_SPLUNK, SEARCH_SPLUNK_DATASET, SEARCH_SPLUNK_MAP]
    .concat(ALERT_TEMPLATES)
    .concat(HEALTH_TEMPLATES)
    .concat(BLAZE_TEMPLATES)
    .concat(EVENT_GEN_TEMPLATES));



{
    'templatePivotNames': string -> [string] U exn
    'get': string * string ->  -> pivot U exn
}

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

*/



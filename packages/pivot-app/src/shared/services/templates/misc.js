import { constructFieldString, SplunkPivot } from '../connectors/splunk.js';
import _ from 'underscore';
import stringhash from 'string-hash';
import { Observable} from 'rxjs';


export const searchSplunk = new SplunkPivot({
    id: 'search-splunk-plain',
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
            label: 'Destination:',
            placeholder: 'msg'
        },
        'pivot': {
            inputType: 'pivotCombo',
            label: 'Pivot:',
        }
    },
    toSplunk: function(pivotParameters, pivotCache) {
        const source = pivotParameters['src'];
        const dest = pivotParameters['dst'];
        const subsearch = `[
            | loadjob "${pivotCache[pivotParameters.pivot].splunkSearchID}"
            | fields ${source}
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

const DATASET_ERROR_NODE_COLORS = {}
    /*    'dataset': 1,
    'msg': 5,
    'EventID': 7
}*/

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
            | fields level, msg, module, time, dataset
            | sort -time
            | dedup msg level dataset
            | head 100
            | fields - _*
        `;
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

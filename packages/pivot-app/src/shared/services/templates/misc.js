import { SplunkPivot } from './SplunkPivot';
import stringhash from 'string-hash';
import logger from '../../logger.js';
import moment from 'moment';

const log = logger.createLogger(__filename);

const GRAPHISTRY_SPLUNK_FIELDS = [
    'module',
    'level',
    'err.message',
    'time',
    'metadata.dataset',
    'err.stackArray{}.file',
    'err.stackArray{}.function',
    'msg',
    'fileName'
]

export const searchSplunk = new SplunkPivot({
    id: 'search-splunk-plain',
    name: 'Search Splunk',
    tags: ['Splunk', 'Graphviz'],
    parameters: [
        {
            name: 'query',
            inputType: 'text',
            label: 'Query:',
            placeholder: 'error',
            defaultValue: 'error',
        },
        {
            name: 'fields',
            inputType: 'multi',
            label: 'Entities:',
            options: GRAPHISTRY_SPLUNK_FIELDS.map(x => ({id:x, name:x})),
            defaultValue: GRAPHISTRY_SPLUNK_FIELDS
        }
    ],
    toSplunk: function (args) {
        this.connections = args.fields.value;
        const query = `search ${args['query']} ${this.constructFieldString()} | head 1000`;

        return { searchQuery: query };
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
    name: 'Graphviz Expand',
    tags: ['Graphviz'],
    parameters: [
        {
            name: 'src',
            inputType: 'text',
            label: 'Source entity:',
            placeholder: '"err.message"'
        },
        {
            name: 'dst',
            inputType: 'text',
            label: 'Destination:',
            placeholder: '"err.stackArray{}.file"'
        },
        {
            name: 'pivot',
            inputType: 'pivotCombo',
            label: 'Pivot:',
        }
    ],
    toSplunk: function(args, pivotCache) {
        const source = args.src;
        const dest = args.dest;
        const sourcePivots = args.pivot.value;

        const subsearch = sourcePivots.map(pivotId =>
                `[| loadjob "${pivotCache[pivotId].splunkSearchId}"
                    | fields ${source} | dedup ${source}
                ]`
        ).join(' | append ');

        const query = `search ${subsearch}
            | fields ${source}, ${dest}
            | fields  - _*`;

        return { searchQuery: query };
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
    name: 'Graphviz Search',
    tags: ['Graphviz'],
    parameters: [
        {
            name: 'query2',
            inputType: 'text',
            label: 'Query:',
            placeholder: 'twitter'
        },
        {
            name: 'level',
            label: 'Severity >=',
            inputType: 'combo',
            options: [
                {value: 30, label: 'info'},
                {value: 40, label: 'warn'},
                {value: 50, label: 'error'},
            ]
        },
        {
            name: 'time',
            inputType: 'daterange',
            default: moment.duration(2, 'day').toJSON()
        }
    ],
    toSplunk: function (args) {
        const q = args['query2'];
        const l = args['level'];
        const query = `search (host=staging* OR host=labs*) source="/var/log/graphistry-json/*.log" ${q} level >= ${l}
            | spath output=File0 path="err.stackArray{0}.file"
            | spath output=File1 path="err.stackArray{1}.file"
            | eval File00=File0 | eval file=if(File00="null", File1, File0)
            ${this.constructFieldString()}`

        return {
            searchQuery: query,
            searchParams: this.dayRangeToSplunkParams(args.time.value),
        };
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
    connections: ['level', 'msg', 'err.message', 'file', 'module', 'metadata.dataset'],
    attributes: ['time']
});

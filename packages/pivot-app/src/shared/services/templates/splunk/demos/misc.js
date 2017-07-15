import { SplunkPivot } from '../splunkPivot.js';
import logger from '../../../../logger.js';

const log = logger.createLogger(__filename);


const graphistryLogOntology = {
    'time': {
        pointSize: 1,
        pointColor: 3,
    },
    'EventID': {
        pointSize: 1,
        pointColor: 9
    },
    'module': {
        pointSize: 4,
        pointColor: 0
    },
    'level': {
        pointSize: 4,
        pointColor: 1,
        pointIcon: 'thermometer-half',
    },
    'err.message': {
        pointSize: 10,
        pointColor: 2,
        pointIcon: 'bug',
    },
    'metadata.dataset': {
        pointSize: 4,
        pointColor: 4,
        pointIcon: 'database',
    },
    'err.stackArray{}.file': {
        pointSize: 5,
        pointColor: 5,
        pointIcon: 'file-code-o',
    },
    'err.stackArray{}.function': {
        pointSize: 5,
        pointColor: 6,
        pointIcon: 'stack-overflow',
    },
    'msg': {
        pointSize: 5,
        pointColor: 7,
        pointIcon: 'comment',
    },
    'fileName': {
        pointSize: 4,
        pointColor: 8,
        pointIcon: 'file',
    }
}


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
                node.pointColor = graphistryLogOntology[node.type].pointColor;
            },
            pointSize: (node) => {
                node.pointSize = graphistryLogOntology[node.type].pointSize;
            },
            pointIcon: (node) => {
                node.pointIcon = graphistryLogOntology[node.type].pointIcon;
            },
        }
    }
});

export const searchGraphviz = new SplunkPivot({
    id: 'search-graphviz-logs',
    name: 'Graphviz Search',
    tags: ['Graphviz'],
    parameters: [
        {
            name: 'query',
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
            label: 'Time',
            inputType: 'daterange',
            default: {
                from: null,
                to: null
            }
        }
    ],
    toSplunk: function (args, pivotCache = {}, { time }) {
        const q = args.query;
        const l = args.level;
        const query = `search (host=staging* OR host=labs*) source="/var/log/graphistry-json/*.log" ${q} level >= ${l}
            | spath output=File0 path="err.stackArray{0}.file"
            | spath output=File1 path="err.stackArray{1}.file"
            | eval File00=File0 | eval file=if(File00="null", File1, File0)
            ${this.constructFieldString()}`

        return {
            searchQuery: query,
            searchParams: this.dayRangeToSplunkParams((args.time||{}).value, time)
        };
    },
    encodings: {
        point: {
            pointColor: (node) => {
                node.pointColor = graphistryLogOntology[node.type].pointColor;
            },
            pointSize: (node) => {
                node.pointSize = graphistryLogOntology[node.type].pointSize;
            },
            pointIcon: (node) => {
                node.pointIcon = graphistryLogOntology[node.type].pointIcon;
            },
        }
    },
    connections: _.without(_.keys(graphistryLogOntology), 'time', 'EventID'),
    attributes: ['time']
});

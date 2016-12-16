import { SplunkPivot } from './SplunkPivot.js';
import logger from '../../logger.js';
import _ from 'underscore';
import stringhash from 'string-hash';
const log = logger.createLogger(__filename);

const SPLUNK_INDICES = {
    EVENT_GEN: 'index=event_gen',
    PAN: 'index=event_gen | search vendor="Palo Alto Networks"'
};

const PAN_NODE_COLORS = { 'EventID': 7, 'user': 1, 'dest': 3, 'threat_name': 5 };

const PAN_NODE_SIZES = { 'EventID': 0.1, 'dest': 1.1, 'user': 5, 'threat_name': 10 };

const PAN_ENCODINGS = {
    point: {
        pointColor: function(node) {
            node.pointColor = PAN_NODE_COLORS[node.type];
            if (node.pointColor === undefined) {
                node.pointColor = stringhash(node.type) % 12;
            }
        },
        pointSizes: function(node) {
            node.pointSize = PAN_NODE_SIZES[node.type];
        }
    }
};

const PAN_SHAPES = {
    userToThreat: {
        connections: [ 'user', 'threat_name'],
        attributes: ['vendor_action', 'category', 'time', 'url', 'severity', 'action']
    },
    userToDest: {
        connections: [ 'dest', 'user' ],
        attributes: [ 'action', 'time', 'severity']
    },
};

export const PAN_SEARCH = new SplunkPivot({
    name: 'PAN - Search',
    id: 'pan-search',
    tags: ['PAN'],
    pivotParameterKeys: ['query', 'nodes'],
    pivotParametersUI: {
        query: {
            inputType: 'text',
            label: 'Search:',
            placeholder: 'severity="critical"'
        },
        nodes: {
            inputType: 'multi',
            label: 'Nodes:',
            options: ['user', 'dest', 'threat_name'].map(x => ({id:x, name:x})),
        }
    },
    attributes: PAN_SHAPES.userToDest.attributes,
    encodings: PAN_ENCODINGS,
    toSplunk: function(pivotParameters) {
        this.connections = pivotParameters.nodes.value;
        const query = `search ${SPLUNK_INDICES.PAN} ${pivotParameters.query}
                ${this.constructFieldString()}
                | head 100`;

        return {
            searchQuery: query,
            searchParams: {earliest_time: '-1y'},
        };
    }
});

const contextFilter = '(severity="critical" OR severity="medium" OR severity="low")';

export const PAN_EXPAND = new SplunkPivot({
    name: 'PAN - Expand',
    id: 'pan-expand',
    tags: ['PAN'],
    pivotParameterKeys: ['source', 'sourceAttribute', 'query', 'nodes'],
    pivotParametersUI: {
        source: {
            inputType: 'pivotCombo',
            label: 'Select events:',
        },
        sourceAttribute: {
            inputType: 'combo',
            label: 'Expand on:',
            options: [
                { value: 'user', label: 'user' },
                { value: 'dest', label: 'dest' }
            ]
        },
        query: {
            inputType: 'text',
            label: 'Subsearch:',
            placeholder: contextFilter
        },
        nodes: {
            inputType: 'multi',
            label: 'Nodes:',
            options: ['user', 'dest', 'threat_name'].map(x => ({id:x, name:x})),
        }
    },
    attributes: PAN_SHAPES.userToDest.attributes,
    encodings: PAN_ENCODINGS,
    toSplunk: function(pivotParameters, pivotCache) {
        this.connections = pivotParameters.nodes.value;
        const sourceAttribute = pivotParameters.sourceAttribute;
        const filter = pivotParameters.query;
        const sourcePivots = pivotParameters.source.value;
        var subsearch = '';
        const list  = sourcePivots.map(
            (pivotId) =>
                (`[| loadjob "${pivotCache[pivotId].splunkSearchId}"
                   | fields ${sourceAttribute} | dedup ${sourceAttribute}]`)
        );
        subsearch = list.join(' | append ');

        const query = `search ${SPLUNK_INDICES.PAN}
                    | search ${filter} ${subsearch} ${this.constructFieldString()}`;

        return {
            searchQuery: query,
            searchParams: {earliest_time: '-1y'},
        };
    },
});

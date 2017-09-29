import { SplunkPivot } from '../splunkPivot.js';
import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);


const SPLUNK_INDICES = {
    EVENT_GEN: 'index=event_gen',
    PAN: 'index=event_gen | search vendor="Palo Alto Networks"'
};

const simOntology = {
    EventID: {
        pointSize: 0.1,
        pointColor: 7,
    },
    user: {
        pointSize: 5,
        pointColor: 1,
        pointIcon: 'user'
    },
    threat_name: {
        pointSize: 10,
        pointColor: 5,
        pointIcon: 'bell',
    },
    action: {
        pointSize: 5,
        pointColor: 2,
        pointIcon: 'bolt',
    },
    url: {
        pointSize: 5,
        pointColor: 3,
        pointIcon: 'link',
    },
    severity: {
        pointSize: 5,
        pointColor: 4,
        pointIcon: 'thermometer-half',
    },
    application: {
        pointSize: 5,
        pointColor: 6,
        pointIcon: 'file-code-o',
    },
    filename: {
        pointSize: 5,
        pointColor: 8,
        pointIcon: 'file',
    },
    client_location: {
        pointSize: 5,
        pointColor: 9,
        pointIcon: 'map-marker',
    },
    dest_hostname: {
        pointSize: 5,
        pointColor: 10,
        pointIcon: 'server',
    },
}

const simAttributes = _.keys(simOntology);

const SIM_ENCODINGS = {
    point: {
        pointColor: function(node) {
            node.pointColor = simOntology[node.type].pointColor || 12;
        },
        pointSizes: function(node) {
            node.pointSize = simOntology[node.type].pointSize || 5;
        },
        pointIcon: function (node) {
            node.pointIcon = simOntology[node.type].pointIcon;
        }
    }
};


export const PAN_SEARCH = new SplunkPivot({
    name: 'PAN - Search',
    id: 'pan-search',
    tags: ['PAN'],
    parameters: [
        {
            name: 'query',
            inputType: 'text',
            label: 'Search:',
            placeholder: 'severity="critical"'
        },
         {
            name: 'nodes',
            inputType: 'multi',
            label: 'Nodes:',
            options: simAttributes.map(x => ({id:x, name:x})),
        }
    ],
    attributes: simAttributes,
    encodings: SIM_ENCODINGS,
    toSplunk: function(args) {
        this.connections = args.nodes.value;
        const query = `search ${SPLUNK_INDICES.PAN} ${args.query}
                ${this.constructFieldString()}
                | head 1000`;

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
    parameters: [
        {
            name: 'source',
            inputType: 'pivotCombo',
            label: 'Select events:',
        },
        {
            name: 'sourceAttribute',
            inputType: 'combo',
            label: 'Expand on:',
            options: simAttributes.map(x => ({value:x, label:x}))
        },
        {
            name: 'query',
            inputType: 'text',
            label: 'Subsearch:',
            placeholder: contextFilter
        },
        {
            name: 'nodes',
            inputType: 'multi',
            label: 'Nodes:',
            options: simAttributes.map(x => ({id:x, name:x})),
        }
    ],
    attributes: simAttributes,
    encodings: SIM_ENCODINGS,
    toSplunk: function(args, pivotCache) {
        this.connections = args.nodes.value;
        const sourceAttribute = args.sourceAttribute;
        const filter = args.query;
        const sourcePivots = args.source.value;
        const list = sourcePivots.map(
            (pivotId) =>
                (`[| loadjob "${pivotCache[pivotId].splunkSearchId}"
                   | fields ${sourceAttribute} | dedup ${sourceAttribute}]`)
        );
        const subsearch = list.join(' | append ');

        const query = `search ${SPLUNK_INDICES.PAN}
                    | search ${filter} ${subsearch} ${this.constructFieldString()}`;

        return {
            searchQuery: query,
            searchParams: {earliest_time: '-1y'},
        };
    },
});

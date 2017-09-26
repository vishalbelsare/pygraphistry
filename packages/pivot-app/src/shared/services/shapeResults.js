import { simpleflake } from 'simpleflakes';
import _ from 'underscore';
import { categoryToColorInt, intToHex } from '../services/support/palette.js';
import { dedupeHyperedges, inference } from './shape/inference.js';
import logger from '../../shared/logger.js';
const log = logger.createLogger(__filename);


function summarizeOutput ({ labels }) {

    //{ typeName -> int }
    const entityTypes = {};
    for (let i = 0; i < labels.length; i++) {
        entityTypes[labels[i].type] = i;
    }

    //{ typeName -> {count, example, name, color} }
    const entitySummaries = _.mapObject(entityTypes, (example, entityType) => {
        return {
            count: 0,
            example: example,
            name: entityType,
            icon: labels[example].pointIcon,
            color: intToHex(categoryToColorInt[labels[example].pointColor])};
    });

    //{ typeName -> {?valName} }
    const valLookups = _.mapObject(entityTypes, () => { return {}; });

    for (let i = 0; i < labels.length; i++) {
        const summary = entitySummaries[labels[i].type];
        const lookup = valLookups[labels[i].type];
        const key = labels[i].node;
        if (!_.has(lookup, key)) {
            lookup[key] = 1;
            summary.count++;
        }
    }

    const entitySummary = {entities: _.values(entitySummaries), resultCount: labels.length};
    return entitySummary;
}







function encodeGraph({ app, pivot }) {

    const { encodings } = pivot.template;
    const { nodes, edges } = pivot.results;

    
    //TODO make node, edge encoding calls functional
    if (encodings && encodings.point) {
        nodes.map(
            (node) => (
                Object.keys(encodings.point).map(
                    (key) => { // eslint-disable-line array-callback-return
                        encodings.point[key](node);
                    }
                )
            )
        );
    }

    if (encodings && encodings.edge) {
        edges.map(
            (edge) => (
                Object.keys(encodings.edge).map(
                    (key) => { // eslint-disable-line array-callback-return
                        encodings.edge[key](edge);
                    }
                )
            )
        );
    }    


    return { 
        app, 
        pivot: {
            ...pivot,
            results: { nodes, edges },
            resultSummary: summarizeOutput({labels: nodes})
         }
     };
}

function extractAllNodes(connections) {
    return (connections === undefined)
            || (connections.length === 0)
            || (connections.indexOf('*') !== -1)
}


// Convert events into a hypergraph
//   -- hypernodes: generate EventID if none available
//   -- if generic nodes/edges, merge in
//   -- track which columns are used
function shapeHyperGraph({ app, pivot } ) {
    const { 
        events = [], 
        graph: { nodes: pivotNodes = [], edges: pivotEdges = [] } = {}, 
        attributes = [], attributesBlacklist = [], 
        connections = [], connectionsBlacklist = [] } = pivot;
    const isStar = extractAllNodes(connections);

    const edges = [];
    const nodeLabels = [];

    const generatedEntities = {};    

    
    for(let i = 0; i < events.length; i++) {
        const row = events[i];
        const eventID = row.EventID || simpleflake().toJSON();

        //TODO partially evaluate outside of loop
        const entityTypes =
            Object.keys(row)
                .filter((field) => field !== 'EventID')
                .filter((field) => isStar || connections.indexOf(field) > -1)
                .filter((field) => row[field] !== undefined)
                .filter((field) => connectionsBlacklist.indexOf(field) === -1);

        const attribs = 
            Object.keys(row)
                .filter((field) => row[field] !== undefined)
                .filter((field) => 
                    field === 'EventID'
                    || !attributes.length
                    || attributes.indexOf(field) > -1)
                .filter((field) => attributesBlacklist.indexOf(field) === -1);

        nodeLabels.push(
            Object.assign({},
                _.pick(row, attribs),
                {'node': eventID, type:'EventID'}));


        for (let j = 0; j < entityTypes.length; j++) {
            const field = entityTypes[j];

            if (field in row && (row[field] !== undefined) && (row[field] !== null)) {
                let entity = generatedEntities[row[field]];
                if (!entity) {
                    entity = {'node': row[field], type: field, cols: [field]};
                    nodeLabels.push(entity);
                    generatedEntities[row[field]] = entity;
                } else {
                    if (!entity.cols) {
                        entity.cols = [];
                    }
                    if (entity.cols.indexOf(field) === -1) {
                        entity.cols.push(field);
                    }
                }
                edges.push(
                    Object.assign({}, _.pick(row, attribs),
                        {
                            'destination': row[field],
                            'source': eventID,
                            'col': field,
                            'edge': `${eventID}:${field}`,
                            'edgeType': ('EventID->' + field),
                            'edgeTitle': `${eventID}->${row[field]}`
                        }
                    )
                );
            }
        }

    }

    const combinedNodes = nodeLabels.concat(pivotNodes)
        .filter(({type}) => 
                isStar 
                || type === 'EventID'
                || (connections.indexOf(type) > -1));

    //TODO filter by global lookup of nodes
    //  (for case where just edges here, and enriched nodes from earlier)
    const combinedEdges = edges
        .concat(pivotEdges
            .map((edge, i) => 'edge' in edge ? 
                edge 
                : {...edge, 'edge': `edge_${pivot.id}_${i}`}));

    return ({ app, 
        pivot: {
            ...pivot,
            results: {
                edges: combinedEdges,
                nodes: combinedNodes
            } 
    }});
}



//dedupe hyperedges w/ same src->reftype->dst and addd inference edges
function globalInference({ app, pivot }) {

    const { nodes = [], edges = [] } = pivot.results;

    const dedupedHyperedges = dedupeHyperedges(edges);

    const newEdges = inference({nodes, edges: dedupedHyperedges, encodings: pivot.template.encodings });

   return ({ app, 
        pivot: {
            ...pivot,
            results: {
                graph: dedupedHyperedges.concat(newEdges),
                labels: nodes
            } 
    }});
}    

export function shapeResults({ app, pivot }) {
    return globalInference(encodeGraph(shapeHyperGraph({ app, pivot })));
}

import { simpleflake } from 'simpleflakes';
import _ from 'underscore';
import { categoryToColorInt, intToHex } from '../services/support/palette.js';
import logger from '../../shared/logger.js';
const log = logger.createLogger(__filename);

//Do not make these nodes in '*' mode
const SKIP = {

    'AdmissionEndDate': true,
    'AdmissionStartDate': true,
    'LabDateTime': true,
    'LabValue': true,
    'LabUnits': true
};

function summarizeOutput ({ results: { labels }}) {

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
    const { labels, graph: edges } = pivot.results;

    if (encodings && encodings.point) {
        //nodeLabels = encodings.point.encode(nodeLabels);
        labels.map(
            (node) => (
                Object.keys(encodings.point).map(
                    // TODO make encodings functional
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
                    // TODO make encodings functional
                    (key) => { // eslint-disable-line array-callback-return
                        encodings.edge[key](edge);
                    }
                )
            )
        );
    }

    pivot.results = {
        graph: edges,
        labels: labels
    };
    pivot.resultSummary = summarizeOutput(pivot);

    return ({ app, pivot });
}

function extractAllNodes(connections) {
    return (connections === undefined)
            || (connections.length === 0)
            || (connections.indexOf('*') !== -1)
}

function shapeHyperGraph({ app, pivot } ) {
    const { events, template } = pivot;
    const { attributes, connections } = template;
    const isStar = extractAllNodes(connections);

    const edges = [];
    const nodeLabels = [];
    for(let i = 0; i < events.length; i++) {
        const row = events[i];
        const eventID = row.EventID || simpleflake().toJSON();

        const fields =
            isStar ?
            _.filter(Object.keys(row), function (field) {
                return !SKIP[field] && (field.toLowerCase() !== 'eventid');
            })
            : _.filter(connections, function (field) { return row[field]; });
        const attribs = (attributes || []).concat(fields);

        nodeLabels.push(
            Object.assign({},
                _.pick(row, attribs),
                {'node': eventID, type:'EventID'}));


        for (let j = 0; j < fields.length; j++) {
            const field = fields[j];

            if (row[field]) {
                nodeLabels.push({'node': row[field], type: field});
                edges.push(
                    Object.assign({}, _.pick(row, attribs),
                        {
                            'destination': row[field],
                            'source': eventID,
                            'edgeType': ('EventID->' + field),
                            '_pivotId': pivot.id
                        }
                    )
                );
            }
        }

    }

    pivot.results = {
        graph: edges,
        labels: nodeLabels,
    };

    return ({ app, pivot });
}

export function shapeSplunkResults({ app, pivot }) {
    return encodeGraph(shapeHyperGraph({ app, pivot }));
}

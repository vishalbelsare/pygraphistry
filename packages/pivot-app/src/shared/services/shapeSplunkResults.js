import { simpleflake } from 'simpleflakes';
import _ from 'underscore';
import { categoryToColorInt, intToHex } from '../services/support/palette.js';

//Do not make these nodes in '*' mode
const SKIP = {

    'AdmissionEndDate': true,
    'AdmissionStartDate': true,
    'LabDateTime': true,
    'LabValue': true,
    'LabUnits': true
};

function summarizeOutput ({labels}) {

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

    return {entities: _.values(entitySummaries), resultCount: labels.length};
}

function encodeGraph({ app, pivot }) {

    const { encodings } = pivot.template;
    const { labels, graph: edges } = pivot.results;

    if (encodings && encodings.point) {
        //nodeLabels = encodings.point.encode(nodeLabels);
        labels.map(
            (node) => (
                Object.keys(encodings.point).map(
                    (key) => {
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
                    (key) => {
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
    pivot.resultSummary = summarizeOutput(pivot.results);

    return ({ app, pivot });
}

function shapeHyperGraph({ app, pivot } ) {
    const { results, rowId, template } = pivot;
    const { attributes, connections } = template;
    const isStar = (connections === undefined) || (connections.indexOf('*') !== -1);

    const edges = [];
    const nodeLabels = [];
    for(let i = 0; i < results.length; i++) {
        const row = results[i];
        const eventID = row['EventID'] || simpleflake().toJSON();

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


        for (var j = 0; j < fields.length; j++) {
            const field = fields[j];

            if (row[field]) {
                nodeLabels.push({'node': row[field], type: field});
                edges.push(Object.assign({}, _.pick(row, attribs),
                    {'destination': row[field],
                        'source': eventID,
                        'edgeType': ('EventID->' + field),
                        'pivot': rowId}));
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

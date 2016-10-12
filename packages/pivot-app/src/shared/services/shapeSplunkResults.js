import { Observable } from 'rxjs';
import { simpleflake } from 'simpleflakes';
var hash = require('object-hash');
import _  from 'underscore';
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
    const hist = {};
    for (var i = 0; i < labels.length; i++) {
        hist[labels[i].type] = {count: 0, example: i, name: '', color: ''};
    }
    const summaries = _.values(hist);

    for (var i = 0; i < labels.length; i++) {
        hist[labels[i].type].count++;
    }

    _.each(summaries, (summary) => {
        summary.name = labels[summary.example].type;
        summary.color = intToHex(categoryToColorInt[labels[summary.example].pointColor]);
    });

    return {entities: summaries, resultCount: labels.length};
}


export function shapeSplunkResults(splunkResults, pivotDict, index, template) {
    const encodings = template.encodings;
    const attributes = template.attributes;
    const connectionsArray = template.connections;
    const isStar = (connectionsArray === undefined) || (connectionsArray.indexOf('*') != -1);

    function shapeHyperGraph({ app, pivot } ) {
        const { events } = pivot;
        const edges = [];
        const nodeLabels = [];
        for(let i = 0; i < events.length; i++) {
            const row = events[i];
            const eventID = row['EventID'] || simpleflake().toJSON();

            const fields =
                isStar ?
                _.filter(Object.keys(row), function (field) {
                    return !SKIP[field] && (field.toLowerCase() !== 'eventid');
                })
                : _.filter(connectionsArray, function (field) { return row[field]; });
            const attribs = (attributes || []).concat(fields);

            nodeLabels.push(
                Object.assign({},
                    _.pick(row, attribs),
                    {'node': eventID, type:'EventID'}));


            for (var j = 0; j < fields.length; j++) {
                const field = fields[j];

                if (field === 'Search') {
                    edges.push(
                        Object.assign({},
                            _.pick(row, attribs),
                            {'destination': destination,
                                'source': eventID,
                                'edgeType': 'EventID->Search',
                                'pivot': index}));
                    nodeLabels.push({'node': destination, type:'Search'});
                    continue;
                }

                if (row[field]) {
                    nodeLabels.push({'node': row[field], type: field});
                    edges.push(Object.assign({}, _.pick(row, attribs),
                        {'destination': row[field],
                            'source': eventID,
                            'edgeType': ('EventID->' + field),
                            'pivot': index}));
                }
            }

        }

        pivot.results = {
            graph: edges,
            labels: nodeLabels,
        };

        return ({ app, pivot });
    }

    function encodeGraph({ app, pivot }) {
        const { labels, graph: edges } = pivot.results;
        if (encodings && encodings.point) {
            //nodeLabels = encodings.point.encode(nodeLabels);
            labels.map((node) =>
                    Object.keys(encodings.point).map((key) => {
                        encodings.point[key](node);
                    }
                    ));
        }

        if (encodings && encodings.edge) {
            edges.map((edge) =>
                    Object.keys(encodings.edge).map((key) => {
                        encodings.edge[key](edge);
                    }
                    ));
        }
        pivot.results =  {
            graph: edges,
            labels: labels
        };
        pivot.resultSummary = summarizeOutput(pivot.results);
        return ({ app, pivot });
    }

    return splunkResults
        .map( shapeHyperGraph )
        .map( encodeGraph );

}

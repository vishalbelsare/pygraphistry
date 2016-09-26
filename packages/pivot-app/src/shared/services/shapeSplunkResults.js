import { Observable } from 'rxjs';
import { simpleflake } from 'simpleflakes';
var hash = require('object-hash');
import _  from 'underscore';


//Do not make these nodes in '*' mode
const SKIP = {
    'AdmissionEndDate': true,
    'AdmissionStartDate': true,
    'LabDateTime': true,
    'LabValue': true,
    'LabUnits': true
};


export function shapeSplunkResults(splunkResults, pivotDict, index, template) {
    const encodings = template.encodings;
    const attributes = template.attributes;
    const connectionsArray = template.links;
    const isStar = (connectionsArray === undefined) || (connectionsArray.indexOf('*') != -1);

    return splunkResults
        .map(function(rows) {
            const edges = [];
            const nodeLabels = [];
            for(let i = 0; i < rows.length; i++) {
                const row = rows[i];
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

            // Encodings
            if (encodings && encodings.point) {
                nodeLabels.map((node) =>
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

            return {
                graph: edges,
                labels: nodeLabels,
            };
        });
}

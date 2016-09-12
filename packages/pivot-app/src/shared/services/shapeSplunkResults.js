import { Observable } from 'rxjs';
import { simpleflake } from 'simpleflakes';
var hash = require('object-hash');
import _  from 'underscore';


//Do not make these nodes in '*' mode
const SKIP = {

    //HEALTH DEMO //TODO stitch in based on pivot
    'AdmissionEndDate': true,
    'AdmissionStartDate': true,
    'LabDateTime': true,
    'LabValue': true,
    'LabUnits': true
};

const nodeSizes = {
    'Host':1.0,
    'Internal IPs':1.5,
    'Fire Eye Source IP': 10.1,
    'External IPs':1.5,
    'User':0.5,
    //    'AV Alert Name':5.1,
    'Fire Eye MD5':10.1,
    //'Fire Eye Alert Name':10.1,
    'Fire Eye URL':2.1,
    'Message': 7.1,
    'EventID':0.1,
    'Search': 1,
};

export function shapeSplunkResults(splunkResults, pivotDict, index, encodings) {
    console.log('Encodings', encodings)
    const destination = pivotDict['Search'];
    const connections = pivotDict['Links'];
    const connectionsArray = connections.split(',').map((connection) => connection.trim());
    const isStar = connectionsArray.indexOf('*') != -1;

    return splunkResults
        .map(function(rows) {
            const edges = [];
            const nodeLabels = [];
            for(let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const eventID = row['EventID'] || simpleflake().toJSON();
                nodeLabels.push({'node': eventID, type:'EventID',
                                pointSize: nodeSizes['EventID']});

                const fields =
                    isStar ?
                        _.filter(Object.keys(row), function (field) {
                            return !SKIP[field] && (field.toLowerCase() !== 'eventid');
                        })
                    : _.filter(connectionsArray, function (field) { return row[field]; });

                for (var j = 0; j < fields.length; j++) {
                    const field = fields[j];

                    if (field === 'Search') {
                        edges.push(Object.assign({}, row,
                            {'destination': destination,
                             'source': eventID,
                             'edgeType': ('EventID->Search'),
                             'pivot': index}));
                        nodeLabels.push({'node': destination, type:'Search',
                                        pointSize: nodeSizes['Search']});
                        continue;
                    }

                    if (row[field]) {
                        nodeLabels.push({'node': row[field], type: field,
                            pointSize: nodeSizes[field]});
                        edges.push(Object.assign({}, row,
                            {'destination': row[field],
                             'source': eventID,
                             'edgeType': ('EventID->' + field),
                             'pivot': index}));
                    }
                }

            }

            const pointEncoding = encodings.pointColor;

            nodeLabels.map((node) => pointEncoding(node));

            return {
                graph: edges,
                labels: nodeLabels,
            };
        });
}

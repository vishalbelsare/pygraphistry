import { Observable } from 'rxjs';
import { simpleflake } from 'simpleflakes';
var hash = require('object-hash');
var _ = require('underscore');

export function shapeSplunkResults(splunkResults, pivotDict) {
    var destination = pivotDict['Search'];
    var connections = pivotDict['Links'];
    var nodeLabels = [];
    return splunkResults
        .map(function(result) {
            var edges = [];
            for(let i = 0; i < result.length; i++) {
                var eventId = simpleflake().toJSON();
                nodeLabels.push({"node": eventId, type:'eventId'});
                edges.push(Object.assign({}, result[i], {'destination': destination, 'source': eventId, edgeType: ('eventId -> Search')}))
                nodeLabels.push({"node": destination, type:'Search'});
                var connectionsArray = connections.split(',').map((connection) => connection.trim());
                for(let j = 0; j < connectionsArray.length; j++) {
                    var connection = connectionsArray[j];
                    if (result[i][connection]) {
                        nodeLabels.push({"node": result[i][connection], type:connection});
                        edges.push(Object.assign({}, result[i], {'destination': result[i][connection], 'source': eventId, edgeType: ('eventId' + '->' + connection)}))
                    }
                }
            }

            return {
                graph: edges, 
                labels: nodeLabels,
            };
        })
}

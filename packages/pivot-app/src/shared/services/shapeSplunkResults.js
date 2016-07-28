import { Observable } from 'rxjs';
import { simpleflake } from 'simpleflakes';
var _ = require('underscore');

function shapeSplunkResults(splunkResults, pivotDict) {
    var destination = pivotDict['Data source'];
    var connection = pivotDict['connectTo'];
    var nodeLabels = [];
	return splunkResults.flatMap(
		(results) => splunkResults
            .map(function(result) {
                var edges = [];
                for(let i = 0; i < result.length; i++) {
                    var eventId = simpleflake().toJSON();
                    nodeLabels.push({"node": eventId});
                    edges.push(Object.assign({}, result[i], {'destination': destination, 'source': eventId}))
                    nodeLabels.push({"node": destination});
                    if (results[i][connection]) {
                        nodeLabels.push({"node": results[i][connection]});
                        edges.push(Object.assign({}, result[i], {'destination': results[i][connection], 'source': eventId}))
                    }
                }
                return {
                    name: ("splunkUpload" + simpleflake().toJSON()),
                    type: "edgelist",
                    graph: edges, 
                    labels: nodeLabels,
                    bindings: {
                        "sourceField": "source",
                        "destinationField": "destination",
                        "idField": "node"
                    }
                };
            })
	)
}

module.exports = {
    shapeSplunkResults: shapeSplunkResults
}

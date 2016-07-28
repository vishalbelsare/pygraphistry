import { Observable } from 'rxjs';
import { simpleflake } from 'simpleflakes';
var _ = require('underscore');

function shapeSplunkResults(splunkResults, pivotDict) {
    var destination = pivotDict['Data source'];
    var nodeLabels = [];
	return splunkResults.flatMap(
		(results) => splunkResults
            .map(function(result) {
                console.log("Result length", result.length);
                var edges = Array(result.length);
                for(let i = 0; i < result.length; i++) {
                    var eventId = simpleflake().toJSON();
                    nodeLabels.push({"node": eventId});
                    edges[i] =  Object.assign({}, result[i], {'destination': destination, 'source': eventId})
                    nodeLabels.push({"node": destination});
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

import { Observable } from 'rxjs';
import { simpleflake } from 'simpleflakes';
var _ = require('underscore');

function shapeSplunkResults(splunkResults, pivotDict) {
    var destination = pivotDict['Data source'];
	return splunkResults.flatMap(
		(results) => splunkResults
            .delay(1000)
            .map(function(result) {
                var shapedResult = Array(2);
                for(let i = 0; i < result.length; i++) {
                    shapedResult[i] =  Object.assign({}, result[i], {'destination': destination, 'source': simpleflake().toJSON()})
                }
                return shapedResult;
            })
	)
}

module.exports = {
    shapeSplunkResults: shapeSplunkResults
}

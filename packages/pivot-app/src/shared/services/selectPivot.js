import { Observable } from 'rxjs';
import { ref as $ref } from 'falcor-json-graph';
import { row as createRow } from '../models';
var pivotToSplunk =  require('./pivotToSplunk.js');
var searchSplunk = require('./searchSplunk.js');
var shapeSplunkResults = require('./shapeSplunkResults.js');
var uploadGraph = require('./uploadGraph.js');


export function selectPivot({ app, id }) {

    const { rows, rowsById } = app;
    const index = id === undefined ?
        rows.length :
        rows.findIndex(({ value: ref }) => (
            ref[ref.length - 1] === id
        )) + 1;
    app.urlIndex = index - 1;
    app.url = rowsById[id].url;
    const row = rowsById[id];

    // TODO There's a much cleaner way to do this.
    var pivotDict = {};
    for(var i = 0; i < row.length; i++) { 
        var cell = row[i];
        var name = row[i].name;
        pivotDict[cell['name']] =  cell['value'];
    }

    var searchQuery = pivotToSplunk.pivotToSplunk(pivotDict);
	var splunkResults = searchSplunk.searchSplunk(searchQuery);
	var shapedResults = shapeSplunkResults.shapeSplunkResults(splunkResults, pivotDict);
    var vizUrl = uploadGraph.uploadGraph(shapedResults);

	return vizUrl.map(
		function (shapedResult) {
            console.log("Succesfully uploaded viz");
			return {app, index}
		}
	);
}

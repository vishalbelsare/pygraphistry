import { Observable } from 'rxjs';
import { ref as $ref } from 'falcor-json-graph';
import { row as createRow } from '../models';
import { pivotToSplunk } from './pivotToSplunk.js';
import { searchSplunk } from './searchSplunk.js';
import { shapeSplunkResults} from './shapeSplunkResults.js';
import { uploadGraph} from './uploadGraph.js';

var graphistryVizUrl = 'https://labs.graphistry.com/graph/graph.html?type=vgraph'

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
    var searchQuery = pivotToSplunk(pivotDict);
	var splunkResults = searchSplunk(searchQuery);
	var shapedResults = shapeSplunkResults(splunkResults, pivotDict);
    var vizUrl = uploadGraph(shapedResults);
	return vizUrl.map(
		function (url) {
            console.log("Succesfully uploaded viz", url);
            app.url = graphistryVizUrl + '&dataset=' + url;
			return {app, index}
		}
	);
}

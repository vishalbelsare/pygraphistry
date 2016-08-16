import { Observable } from 'rxjs';
import { ref as $ref } from 'falcor-json-graph';
import { row as createRow } from '../models';
import { pivotToSplunk } from './pivotToSplunk.js';
import { searchSplunk } from './searchSplunk.js';
import { shapeSplunkResults} from './shapeSplunkResults.js';
import { uploadGraph} from './uploadGraph.js';
var _ = require('underscore');
var hash = require('object-hash');
var jsonfile = require('jsonfile')

var graphistryVizUrl = 'https://labs.graphistry.com/graph/graph.html?type=vgraph'

export function searchPivot({ app, id }) {

    const { rows, rowsById } = app;
    const index = id === undefined ?
        rows.length :
        rows.findIndex(({ value: ref }) => (
            ref[ref.length - 1] === id
    ));
    const row = rowsById[id];
    row.enabled = true;

    // TODO There's a much cleaner way to do this.
    var pivotDict = {};
    for(var i = 0; i < row.length; i++) { 
        var cell = row[i];
        var name = row[i].name;
        pivotDict[cell['name']] =  cell['value'];
    }

    var splunkResults;
    var searchQuery = pivotToSplunk(pivotDict);
    var splunkResults = searchSplunk(searchQuery)
        .do(({resultCount}) => {
            row.resultCount = resultCount})
        .map(({output}) => output);
    var shapedResults = shapeSplunkResults(splunkResults, pivotDict)
        .do((results) => row.results = results)
        .map((results) => ({app, index}));
    return shapedResults;

}

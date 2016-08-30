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

    const { pivots, pivotsById } = app;
    const index = id === undefined ?
        pivots.length :
        pivots.findIndex(({ value: ref }) => (
            ref[ref.length - 1] === id
    ));
    const pivot = pivotsById[id];
    pivot.enabled = true;

    // TODO There's a much cleaner way to do this.
    var pivotDict = {};
    for(var i = 0; i < pivot.length; i++) { 
        var cell = pivot[i];
        var name = pivot[i].name;
        pivotDict[cell['name']] =  cell['value'];
    }

    var splunkResults;
    var searchQuery = pivotToSplunk(pivotDict);
    var splunkResults = searchSplunk(searchQuery)
        .do(({resultCount}) => {
            pivot.resultCount = resultCount})
        .map(({output}) => output);
    var shapedResults = shapeSplunkResults(splunkResults, pivotDict)
        .do((results) => pivot.results = results)
        .map((results) => ({app, index}));
    return shapedResults;

}

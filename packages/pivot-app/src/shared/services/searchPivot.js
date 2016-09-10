import { Observable } from 'rxjs';
import { ref as $ref } from '@graphistry/falcor-json-graph';
import { row as createRow } from '../models';
import { pivotToSplunk } from './pivotToSplunk.js';
import { searchSplunk } from './searchSplunk.js';
import { shapeSplunkResults} from './shapeSplunkResults.js';
import { uploadGraph} from './uploadGraph.js';
import PivotTemplates from '../models/PivotTemplates';
var _ = require('underscore');
var hash = require('object-hash');
var jsonfile = require('jsonfile')



//TODO how to dynamically lookup?
// {int -> [ { ... } ]
var pivotCache = {};



export function searchPivot({app, investigation, index }) {

    const pivots = investigation;
    const { pivotsById } = app;
    var index = index === null || index === undefined ? (pivots.length - 1) : index;

    const id = investigation[index].value[1];
    const pivot = pivotsById[id];
    pivot.enabled = true;

    //{'Search': string, 'Mode': string, ...}
    const pivotFields =
        _.object(
            _.range(0, pivot.length)
                .map((i) => [pivot[i].name, pivot[i].value]));
    const template = PivotTemplates.get(pivotFields.Mode);

    if (template.transport !== 'Splunk') {
        throw new Error('Only expected Splunk transports, got: ' + template.transport);
    }

    const query = template.splunk.toSplunk(pivots, app, pivotFields, pivotCache);
    var searchQuery = pivotToSplunk({'Search': query});
    console.log('======= Search ======')
    console.log(query)
    console.log('------- Expansion ---');
    console.log(searchQuery);
    const splunkResults = searchSplunk(searchQuery)
        .do(({resultCount}) => {
            pivot.resultCount = resultCount})
         .do((rows) => {
            pivotCache[index] = rows.output;
            console.log('saved pivot ', index, '# results:', rows.output.length); })
        .map(({output}) => output);
    var shapedResults = shapeSplunkResults(splunkResults, pivotFields, index)
        .do((results) => pivot.results = results)
        .map((results) => ({app, investigation, pivot}));
    return shapedResults;

}

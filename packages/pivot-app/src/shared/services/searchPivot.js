import { Observable } from 'rxjs';
import { ref as $ref } from '@graphistry/falcor-json-graph';
import { row as createRow } from '../models';
import { searchSplunk } from './searchSplunk.js';
import { shapeSplunkResults} from './shapeSplunkResults.js';
import { uploadGraph} from './uploadGraph.js';
import PivotTemplates from '../models/PivotTemplates';
import { categoryToColorInt, intToHex } from './support/palette.js';
var _ = require('underscore');
var hash = require('object-hash');
var jsonfile = require('jsonfile')



//TODO how to dynamically lookup?
// {int -> [ { ... } ]
var pivotCache = {};


function summarizeOutput ({labels}) {
    const hist = {};
    for (var i = 0; i < labels.length; i++) {
        hist[labels[i].type] = {count: 0, example: i, name: '', color: ''};
    }
    const summaries = _.values(hist);

    for (var i = 0; i < labels.length; i++) {
        hist[labels[i].type].count++;
    }

    _.each(summaries, (summary) => {
        summary.name = labels[summary.example].type;
        summary.color = intToHex(categoryToColorInt[labels[summary.example].pointColor]);
    });

    return {entities: summaries, resultCount: labels.length};
}


export function searchPivot({app, investigation, pivot, index }) {
    pivot.enabled = true;

    //{'Search': string, 'Mode': string, ...}
    const pivotFields =
        _.object(
            _.range(0, pivot.length)
                .map((i) => [pivot[i].name, pivot[i].value]));
    //TODO when constrained investigation pivotset templating, change 'all'-> investigation.templates
    const template = PivotTemplates.get('all', pivotFields.Mode);

    if (template.transport !== 'Splunk') {
        throw new Error('Only expected Splunk transports, got: ' + template.transport);
    }

    const searchQuery = template.splunk.toSplunk(investigation.pivots, app, pivotFields, pivotCache);
    pivot.searchQuery = searchQuery;
    console.log('======= Search ======')
    console.log(searchQuery);
    const splunkResults = searchSplunk(searchQuery)
        .do(({resultCount, output}) => {
            pivot.resultCount = resultCount;
        })
        .do(({output, splunkSearchID}) => {
            pivotCache[index] = { results: output, query:searchQuery, search: pivotFields['Search'], splunkSearchID };
            console.log('saved pivot ', index, '# results:', output.length); })
        .map(({output}) => output);
    var shapedResults = shapeSplunkResults(splunkResults, pivotFields, index, template.splunk)
        .do((results) => {
            pivot.results = results;
            pivot.resultSummary = summarizeOutput(results);
        })
        .map((results) => ({app, investigation, pivot}));
    return shapedResults;

}

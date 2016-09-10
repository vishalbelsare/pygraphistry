import { Observable } from 'rxjs';
import { ref as $ref } from '@graphistry/falcor-json-graph';
import { row as createRow } from '../models';
import { pivotToSplunk } from './pivotToSplunk.js';
import { searchSplunk } from './searchSplunk.js';
import { shapeSplunkResults} from './shapeSplunkResults.js';
import { uploadGraph} from './uploadGraph.js';
var _ = require('underscore');
var hash = require('object-hash');
var jsonfile = require('jsonfile')

var graphistryVizUrl = 'https://labs.graphistry.com/graph/graph.html?type=vgraph'




//TODO how to dynamically lookup?
// {int -> [ { ... } ]
var pivotCache = {};


function joinTemplate (str) {
    var hit = str.match(/{(.*)} -{(.*)}-> {(.*)}/);
}

function buildLookup(text, lookups, level) {
    var out = text;

    //Special casing of [search] -[field]-> [source]
    var hit = out.match(/\[(.*)\] *-\[(.*)\]-> *\[(.*)\]/);
    if (hit) {
        var search = hit[1];
        var field = hit[2];
        var source = hit[3];

        if (search.match(/\{\{ *pivot/)) {
            //to avoid duplication of results, if base is a {{pivotX}}, do a lookup rather than re-search
            //(join copies fields from base into result, and '*' linkage will therefore double link those,
            // so this heuristic avoids that issue here)
            var vals = _.uniq(_.map(pivotCache[search.match(/\d+/)[0]], function (row) {
                return row[field];
            }));
            var match = `"${ field }"="` + vals.join(`" OR "${ field }"="`) + '"';
            out = `"Alert Category"="${ source }" index="alert_graph_demo" ${ match }`;
        } else {
            //double linkage ok because would not have had otherwise
            out = `"Alert Category"="${ source }" index="alert_graph_demo" | join "${ field }" overwrite=false [search ${ search }]`;
        }
    }

    //regular macro
    for (var i = 0; i < level; i++) {
        out = out.replace(new RegExp('\\{\\{pivot' + i + '\\}\\}', 'g'), lookups[i] + ' | fields *');
    }

    return out;
}

function buildLookups (pivots, pivotsById) {
    var lookups = {};
    for (var i = 0; i < pivots.length; i++) {
        var lookup = buildLookup(pivotToSearchString(pivots[i], {pivotsById}), lookups, i);
        console.log('pivot', i, '->', lookup);
        lookups[i] = lookup;
    }
    return lookups;
}

function expandTemplate(pivots, {pivotsById}, text) {
    var lookups = buildLookups(pivots, pivotsById);
    return buildLookup(text, lookups, pivots.length);
}



function pivotIdToSearchString (id, {pivotsById}) {
    const pivot = pivotsById[id];
    for(var i = 0; i < pivot.length; i++) {
        if (pivot[i].name === 'Search') {
            return pivot[i].value;
        }
    }
    throw new Error('could not find Search in pivot id ', id);
}
function pivotToSearchString(pivot, {pivotsById}) {
    return pivotIdToSearchString(pivot.value[1], {pivotsById});
}

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

    const rawSearch = pivotIdToSearchString(id, app);
    var query = expandTemplate(pivots, app, rawSearch);
    var searchQuery = pivotToSplunk({'Search': query});
    console.log('======= Search ======')
    console.log(rawSearch)
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

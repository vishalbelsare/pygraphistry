import PivotTemplates from '../../models/PivotTemplates';
import { searchSplunk } from '../../services/searchSplunk.js';
import { shapeSplunkResults} from '../../services/shapeSplunkResults.js';
import _ from 'underscore';

const pivotCache = {}
export class SplunkPivot {
    constructor( pivotDescription ) {
        let { name, label, kind, toSplunk, connections, encodings, fields, attributes } = pivotDescription
        this.name = name;
        this.label = label;
        this.kind = kind;
        this.toSplunk = toSplunk;
        this.connections = connections;
        this.encodings = encodings;
        this.attributes = attributes;
    }

    searchAndShape({app, pivot, rowId}) {

        pivot.searchQuery = this.toSplunk(pivot.pivotParameters, pivotCache);

        const splunkResults = searchSplunk({app, pivot})
        // TODO figure out what to do with pivotCache)
            .do(({pivot}) => {
                pivotCache[pivot.id] = { results: pivot.results,
                    query:pivot.searchQuery,
                    splunkSearchID: pivot.splunkSearchID
                };
            })

        return shapeSplunkResults(splunkResults, pivot.pivotParameters, pivot.id, this, pivot.rowId)
            .map(({app, pivot}) => {
                pivot.status = { ok: true };
                return { app, pivot }
        });
    }
}

function buildLookup(text, pivotCache) {

    //Special casing of [search] -[field]-> [source]
    //   search can be "{{pivot###}}""
    //   field can be  "field1, field2,field3, ..."
    //   source is any search
    var hit = text.match(/\[{{(.*)}}\] *-\[(.*)\]-> *\[(.*)\]/);
    if (hit) {
        var search = hit[1];
        var fields = hit[2].split(',')
            .map(s => s.trim())
            .map(s => s[0] === '"' ? s.slice(1,-1).trim() : s);
        var source = hit[3];

        console.log('looking at: ', {search, fields, source});
        var match = '';
        for (var i = 0; i < fields.length; i++) {
            const field = fields[i];
            const vals = _.uniq(_.map(pivotCache[search].results, function (row) {
                return row[field];
            }));
            //console.log('the vals:', vals, 'length', vals.length);
            const fieldMatch = `"${ field }"="${ vals.join(`" OR "${ field }"="`) }"`;
            //const fieldMatch = `"${ field }"::"${ vals.join(`" OR "${ field }"::"`) }"`;
            match = match + (match ? ' OR ' : '') + fieldMatch;
        }
        return `${ source } ${ match } | head 10000 `;
    }
}


//Assumes previous pivots have populated pivotCache
export const expandTemplate = (text, pivotCache) => {
    console.log('expanding: ', text);
    return buildLookup(text, pivotCache);
};


function pivotIdToTemplate(id, {pivotsById}) {
    const pivot = pivotsById[id];
    for(var i = 0; i < pivot.length; i++) {
        if (pivot[i].name === 'Mode') {
            return PivotTemplates.get([pivot[i].value]);
        }
    }
    throw new Error('could not find Mode in pivot id ', id);
}

function pivotToTemplate () {
    return pivotIdToTemplate(pivot.value[1], {pivotsById});
}

export function constructFieldString(pivotTemplate) {
    console.log('Template', pivotTemplate);
    const fields = (pivotTemplate.connections || [])
        .concat(pivotTemplate.attributes || []);
    return `| rename _cd as EventID
            | eval c_time=strftime(_time, "%Y-%d-%m %H:%M:%S")
            | fields "c_time" as time, "EventID", "${fields.join('","')}" | fields - _*`;
}

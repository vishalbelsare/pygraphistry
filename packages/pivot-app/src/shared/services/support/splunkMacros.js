import PivotTemplates from '../../models/PivotTemplates';
import _ from 'underscore';


function buildLookup(text, pivotCache) {

    //Special casing of [search] -[field]-> [source]
    //   search can be "{{pivot###}}""
    //   field can be  "field1, field2,field3, ..."
    //   source is any search
    var hit = text.match(/\[(.*)\] *-\[(.*)\]-> *\[(.*)\]/);
    if (hit) {
        var search = hit[1];
        var fields = hit[2].split(',')
            .map(s => s.trim())
            .map(s => s[0] === '"' ? s.slice(1,-1).trim() : s);
        var source = hit[3];

        console.log('looking at: ', {search, fields, source});

        if (search.match(/\{\{ *pivot/i)) {
            //[{{pivot1}}] -[ URL ] -> [ bluecoat ]
            //to avoid duplication of results, if base is a {{pivotX}}, do a lookup rather than re-search
            //(join copies fields from base into result, and '*' linkage will therefore double link those,
            // so this heuristic avoids that issue here)
            var match = '';
            for (var i = 0; i < fields.length; i++) {
                const field = fields[i];
                const vals = _.uniq(_.map(pivotCache[search.match(/\d+/)[0]], function (row) {
                    return row[field];
                }));
                console.log('the vals:', vals);
                const fieldMatch = `"${ field }"="${ vals.join(`" OR "${ field }"="`) }"`;
                match = match + (match ? ' OR ' : '') + fieldMatch;
            }
            return `${ source } ${ match } | head 10000 | uniq `;
        } else {
            //[search Fireeye botnet] -> [ URL ] -> [ bluecoat ]
            //this is disjunctive on field matches
            //  for conjunctive, do " | join x, y, z [ search ... ]"
            var out = '';
            for (var i = 0; i < fields.length; i++) {
                const field = fields[i];
                out += `
                    ${i > 0 ? ' | append [ search ' : ''}
                    ${ source } | join "${ field }" overwrite=false [search ${ search}]
                    ${i > 0 ? ' ] ' : ''}`;
            }
            return `${out} | uniq`;
        }
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
    const fields = (pivotTemplate.fields || [])
        .concat(pivotTemplate.attributes || []);
    return ` | fields "${fields.join('" , "')}" | fields - _*`;
}

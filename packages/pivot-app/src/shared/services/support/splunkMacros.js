import { searchSplunk } from '../../services/searchSplunk.js';
import { shapeSplunkResults} from '../../services/shapeSplunkResults.js';
import _ from 'underscore';
import logger from '../../../shared/logger.js';
const log = logger.createLogger('pivot-app', __filename);


const pivotCache = {}
export class SplunkPivot {
    constructor( pivotDescription ) {
        let {
            id, name,
            pivotParameterKeys, pivotParametersUI,
            toSplunk, connections, encodings, attributes
        } = pivotDescription;

        this.id = id;
        this.name = name;
        this.pivotParameterKeys = pivotParameterKeys;
        this.pivotParametersUI = pivotParametersUI;
        this.toSplunk = toSplunk;
        this.connections = connections;
        this.encodings = encodings;
        this.attributes = attributes;
    }

    searchAndShape({ app, pivot }) {

        pivot.searchQuery = this.toSplunk(pivot.pivotParameters, pivotCache);
        pivot.template = this;

        // TODO figure out what to do with pivotCache)
        const splunkResults = searchSplunk({app, pivot})
            .do(({pivot}) => {
                pivotCache[pivot.id] = { results: pivot.results,
                    query:pivot.searchQuery,
                    splunkSearchID: pivot.splunkSearchID
                };
            });

        return splunkResults
            .map(({app, pivot}) => shapeSplunkResults({app, pivot}));
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

        log.trace({search, fields, source}, 'Looking at');
        var match = '';
        for (var i = 0; i < fields.length; i++) {
            const field = fields[i];
            const vals = _.uniq(_.map(pivotCache[search].results, function (row) {
                return row[field];
            }));
            const fieldMatch = `"${ field }"="${ vals.join(`" OR "${ field }"="`) }"`;
            match = match + (match ? ' OR ' : '') + fieldMatch;
        }
        return `${ source } ${ match } | head 10000 `;
    }
}


//Assumes previous pivots have populated pivotCache
export const expandTemplate = (text, pivotCache) => {
    log.debug({toExpand: text}, 'Expanding');
    return buildLookup(text, pivotCache);
};


export function constructFieldString(pivotTemplate) {
    const fields = (pivotTemplate.connections || [])
        .concat(pivotTemplate.attributes || []);
    if (fields.length > 0) {
        return `| rename _cd as EventID
                | eval c_time=strftime(_time, "%Y-%d-%m %H:%M:%S")
                | fields "c_time" as time, "EventID", "${fields.join('","')}" | fields - _*`;
    } else { // If there are no fields, load all
        return `| rename _cd as EventID
                | eval c_time=strftime(_time, "%Y-%d-%m %H:%M:%S")
                | rename "c_time" as time | fields * | fields - _*`;
    }

}

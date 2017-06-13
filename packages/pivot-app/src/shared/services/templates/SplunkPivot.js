import _ from 'underscore';
import { Observable } from 'rxjs';
import moment from 'moment-timezone';
import { PivotTemplate } from './template.js';
import { splunkConnector0 } from '../connectors';
import { shapeSplunkResults } from '../shapeSplunkResults.js';
import logger from '../../../shared/logger.js';
const log = logger.createLogger(__filename);


export class SplunkPivot extends PivotTemplate {
    constructor( pivotDescription ) {
        super(pivotDescription);

        const { toSplunk, connections, encodings, attributes } = pivotDescription;
        this.toSplunk = toSplunk;
        this.connections = connections;
        this.encodings = encodings;
        this.attributes = attributes;
        this.connector = splunkConnector0;
    }

    searchAndShape({ app, pivot, pivotCache }) {

        const args = this.stripTemplateNamespace(pivot.pivotParameters);
        const {searchQuery, searchParams} = this.toSplunk(args, pivotCache);
        log.trace({pivotParameters: pivot.pivotParameters, args}, 'Pivot parameters');
        pivot.template = this;

        if (!pivot.enabled) {
            pivot.resultSummary = {};
            pivot.resultCount = 0;
            return Observable.of({ app, pivot });
        } else {

            return this.connector.search(searchQuery, searchParams)
                .do(({ resultCount, events, searchId, df, isPartial }) => {
                    pivot.df = df;
                    pivot.resultCount = resultCount;
                    pivot.events = events;
                    pivot.splunkSearchId = searchId;
                    pivot.isPartial = isPartial;
                    pivot.connections = this.connections;
                    pivot.attributes = this.attributes;
                    pivotCache[pivot.id] = {
                        results: pivot.results,
                        query: searchQuery,
                        splunkSearchId: pivot.splunkSearchId
                    };
                })
                .map(() => shapeSplunkResults({app, pivot}))
                .do(({pivot: pivotShaped}) => {
                    pivot.results = pivotShaped.results;
                });
        }
    }

    //{ from: ?{ date: ?moment.json, time: ?moment.json, timezone: ?moment.json }, 
    //  to: ?{ date: ?moment.json, time: ?moment.json, timezone: moment.json } }
    // -> ?{ earliest_time: utc int, latest_time: utc int }
    dayRangeToSplunkParams(params) {        

        if (!params) { return undefined; }

        const { from, to } = params;

        const flattenTime = function ({ date, time, timezone }, defaultTime) {
            const dateStr = moment(date).format('L');
            const timeStr = time === null || time === undefined ? defaultTime 
                : (moment(time).format('H:m:s'));
            return moment.tz(
                dateStr + timeStr, 'L H:m:s',
                timezone || "America/Los_Angeles").unix();
        };

        const out = !(from && from.date) && !(to && to.date) ? undefined
            : {
                ...(from && from.date ? {earliest_time: flattenTime(from, '0:0:0')} : {}),
                ...(to && to.date ? {latest_time: flattenTime(to, '23:59:59')} : {})
            };

        log.debug('Date range', { from, to }, '->', out);

        return out;
        
    }

    //Assumes previous pivots have populated pivotCache
    expandTemplate(text, pivotCache) {
        log.debug({toExpand: text}, 'Expanding');
        return buildLookup(text, pivotCache);
    }

    constructFieldString() {
        const fields = (this.connections || []).concat(this.attributes || []);
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
}

function buildLookup(text, pivotCache) {

    //Special casing of [search] -[field]-> [source]
    //   search can be "{{pivot###}}""
    //   field can be  "field1, field2,field3, ..."
    //   source is any search
    const hit = text.match(/\[{{(.*)}}] *-\[(.*)]-> *\[(.*)]/);
    if (hit) {
        const search = hit[1];
        const fields = hit[2].split(',')
            .map(s => s.trim())
            .map(s => s[0] === '"' ? s.slice(1,-1).trim() : s);
        const source = hit[3];

        log.trace({search, fields, source}, 'Looking at');
        let match = '';
        for (let i = 0; i < fields.length; i++) {
            const field = fields[i];
            const vals = _.uniq(_.map(pivotCache[search].events, function (row) {
                return row[field];
            }));
            const fieldMatch = `"${ field }"="${ vals.join(`" OR "${ field }"="`) }"`;
            match = match + (match ? ' OR ' : '') + fieldMatch;
        }
        return `${ source } ${ match } | head 10000 `;
    } else {
        return undefined;
    }
}

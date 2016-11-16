import { searchSplunk } from '../../services/searchSplunk.js';
import { shapeSplunkResults} from '../../services/shapeSplunkResults.js';
import logger from '../../../shared/logger.js';
import conf from '../../../server/config.js';

import _ from 'underscore';
import { Observable } from 'rxjs';
import splunkjs from 'splunk-sdk';
import VError from 'verror';

const pivotCache = {}

const SPLUNK_HOST = conf.get('splunk.host');
const SPLUNK_USER = conf.get('splunk.user');
const SPLUNK_PWD = conf.get('splunk.key');

const metadata = { splunkHostName: SPLUNK_HOST, splunkUser: SPLUNK_USER }
const log = logger.createLogger('pivot-app', __filename).child(metadata);

const service = new splunkjs.Service({
    host: SPLUNK_HOST,
    username: SPLUNK_USER,
    password: SPLUNK_PWD
});

const splunkLogin = Observable.bindNodeCallback(service.login.bind(service));

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

        return this.login()
            .switchMap(() => searchSplunk({app, pivot}))
            .do(({pivot}) => {
                pivotCache[pivot.id] = { results: pivot.results,
                    query:pivot.searchQuery,
                    splunkSearchID: pivot.splunkSearchID
                };
            })
            .map(({app, pivot}) => shapeSplunkResults({app, pivot}));
    }

    login() {
        return splunkLogin()
            .do(log.info('Successful splunk login'))
            .catch(({error, status}) => {
                if (error) {
                    return Observable.throw(
                        new VError({
                            name: 'ConnectionError',
                            cause: error,
                            info: {
                                splunkAddress: error.address,
                                splunkPort: error.port,
                                code: error.code,
                            }
                        }, 'Failed to connect to splunk instance at "%s:%d"', error.address, error.port)
                    );
                } else if (status === 401) {
                    return Observable.throw(
                        new VError({
                            name: 'UnauthorizedSplunkLogin',
                        }, 'Splunk Credentials are invalid')
                    );
                } else {
                    return Observable.throw(
                        new VError({
                            name: 'UnhandledStatus',
                        }, 'Uknown response')
                    );
                }
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

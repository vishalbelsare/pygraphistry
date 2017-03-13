import { DataFrame } from 'dataframe-js';
import { Observable } from 'rxjs';
import { run } from 'node-jq';
import { VError } from 'verror'

import { shapeSplunkResults } from '../../shapeSplunkResults.js';
import { flattenJson } from '../../support/flattenJson.js';
import { PivotTemplate } from '../template.js';
import { httpConnector0 } from '../../connectors/http';
import logger from '../../../../shared/logger.js';
const log = logger.createLogger(__filename);


export class HttpPivot extends PivotTemplate {
    constructor( pivotDescription ) {
        super(pivotDescription);

        const { toUrls, connections, encodings, attributes, connector } = pivotDescription;
        this.toUrls = toUrls;
        this.connections = connections;
        this.encodings = encodings;
        this.attributes = attributes;
        this.connector = connector || httpConnector0;
    }

    searchAndShape({ app, pivot, pivotCache }) {

        pivot.template = this;

        //TODO why isn't this in the caller?
        if (!pivot.enabled) {
            pivot.resultSummary = {};
            pivot.resultCount = 0;
            return Observable.of({ app, pivot });
        }

        const params = this.stripTemplateNamespace(pivot.pivotParameters);
        log.info({
            params,
            pivotParameters: pivot.pivotParameters
        })
        const { jq } = params;

        log.trace('searchAndShape http: jq', {jq});

        if ((jq||'').match(/\|.*(include|import)\s/)) {
            return Observable.throw(new VError({
                name: 'JqSandboxException',
                cause: new Error('JqSandboxException'),
                info: { jq },
            }, 'JQ include and imports disallowed', { jq }));
        }

        const df = Observable.from(this.toUrls(params, pivotCache))
            .flatMap((url) => {
                log.info('searchAndShape http: url', {url});
                return this.connector.search(url)                    
                    .switchMap(([response]) => {
                        return Observable
                            .fromPromise(run(jq || '.', response.body, { input: 'string', output: 'json'}))
                            .catch((e) => {
                                return Observable.throw(
                                    new VError({
                                        name: 'JqRuntimeError',
                                        cause: e,
                                        info: { url, jq },
                                    }, 'Failed to run jq post process', { url, jq }));
                            })
                    })
                    .map((response) => {                        
                        log.trace('searchAndShape response', response);
                        const rows = 
                            response instanceof Array 
                                ? response.map(flattenJson) 
                                : [flattenJson(response)];
                        if (rows.length) {
                            if (!('EventID' in rows[0])) {
                                for (let i = 0; i < rows.length; i++) {
                                    rows[i].EventID = pivot.id + ':' + i;
                                }
                            }                    
                        }
                        return new DataFrame(rows);
                    })
                    .do((df) => log.trace('searchAndShape http', {url, rows: df.count()}));
            })
            .reduce((acc, df) => acc ? acc.union(df) : df)
            .last();

        return df.map((df) => ({
                app,
                pivot: {
                    ...pivot,
                    df: df,
                    resultCount: df.count(),//really want shaped..
                    template: this,
                    events: df.toCollection(),
                    results: {
                        graph: [],
                        labels: []
                    }
                }
            }))
            .map(shapeSplunkResults)
            .do(({pivot: realPivot}) => {
                for (const i in realPivot) {
                    pivot[i] = realPivot[i];
                }
                log.info('results', pivot.resultCount);
                pivotCache[pivot.id] = { params, results: pivot.results };
            })
            .do(() => log.trace('searchAndShape http'));
    }

}



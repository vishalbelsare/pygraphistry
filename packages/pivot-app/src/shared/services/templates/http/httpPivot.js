import { template } from '../../support/template';
import { DataFrame } from 'dataframe-js';
import { Observable } from 'rxjs';
import { jqSafe } from '../../support/jq';
import { VError } from 'verror'

import { shapeSplunkResults } from '../../shapeSplunkResults.js';
import { flattenJson } from '../../support/flattenJson.js';
import { PivotTemplate } from '../template.js';
import { defaultHttpConnector } from '../../connectors/http';
import logger from '../../../../shared/logger.js';
const log = logger.createLogger(__filename);


//dfUnion is glitchy when cols mismatch, fill with NAs
// ?df * ?df -> ?df
function dfUnion(dfA, dfB) {

    log.info('=========== union of', dfA, dfB);


    if (!dfA) { return dfB; }
    if (!dfB) { return dfA; }

    const cA = dfA.listColumns();
    const cB = dfB.listColumns();
    const cols = cA.slice();
    cB.forEach((col) =>  {
        if (cols.indexOf(col) === -1) {
            cols.push(col);
        }
    });

    return dfA.restructure(cols).union(dfB.restructure(cols));
}



export class HttpPivot extends PivotTemplate {
    constructor( pivotDescription ) {
        super(pivotDescription);

        const { toUrls, encodings, connector } = pivotDescription;
        this.toUrls = toUrls;
        this.encodings = encodings;
        this.connector = connector || defaultHttpConnector;
    }

    //Clone, with selective, managed overriding of (untrusted) settings
    clone ({ toUrls, encodings, connector, ...settings}) {
        if (toUrls || connector) {
            throw new Error(`Cannot override toUrls and connector 
                when ${settings.id} (${settings.name}) extending HttpPivot`);
        }

        const template = super.clone(settings);
        ['toUrls', 'connector']
            .forEach((fld) => {
                template[fld] = this[fld];
            });
        
        template.encodings = encodings || this.encodings;

        template.searchAndShape = this.searchAndShape;
        template.clone = this.clone;

        return template;
    }

    searchAndShape({ app, pivot, pivotCache }) {

        //TODO why isn't this in the caller?
        if (!pivot.enabled) {
            pivot.resultSummary = {};
            pivot.resultCount = 0;
            return Observable.of({ app, pivot });
        }

        const params = this.stripTemplateNamespace(pivot.pivotParameters);
        log.info('http searchAndShape', {
            params,
            pivotParameters: pivot.pivotParameters
        })
        const { jq, nodes, attributes } = params;

        
        log.trace('searchAndShape http: jq', {jq});

        if ((jq||'').match(/\|.*(include|import)\s/)) {
            return Observable.throw(new VError({
                name: 'JqSandboxException',
                cause: new Error('JqSandboxException'),
                info: { jq },
            }, 'JQ include and imports disallowed', { jq }));
        }

        let urls;
        try {
            urls = this.toUrls(params, pivotCache)
        } catch (e) {
            return Observable.throw(new VError({
                name: 'UrlGeneratorError',
                cause: e,
                info: { params, pivotCache },
                }, 'Failed to generate urls', params));
        }

        let eventCounter = 0;    
        const df = Observable.from(urls)
            .flatMap((maybeUrl) => {

                if (maybeUrl instanceof Error) {
                    log.error('HTTP GET received an Error url', maybeUrl);
                    return Observable.of({e: maybeUrl});
                }

                const { url, params } = maybeUrl;
                log.info('searchAndShape http: url', {url});
                return this.connector.search(url)                    
                    .switchMap(([response]) => {
                        return jqSafe(response.body, template(jq || '.', params))
                            .catch((e) => {
                                log.error('jq error', {url, jq, e});
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
                                    rows[i].EventID = pivot.id + ':' + (eventCounter + i);
                                }
                                eventCounter += rows.length;
                            }                    
                        }
                        return new DataFrame(rows);
                    })
                    .do((df) => log.debug('searchAndShape http raw', {df, url, rows: df.count()}))
                    .do((df) => log.debug('------searchAndShape http cols', df.listColumns()))
                    .map((df) => ({df}))
                    .catch((e) => Observable.of({e: e ? e : new Error('GenericHttpGetException')}));

            })
            .do(({df, e}) => log.debug('searchAndShape http caught', 
                df ? {rows: df.count()} : {e}))
            .reduce((acc, {df, e}) => ({
                    df: dfUnion(acc.df, df),
                    e: e ? acc.e.concat([e]) : acc.e
                }),
                {df: undefined, e: []})
            .last()
            .flatMap(({df, e}) => {
                if (e.length && (e.length === urls.length)) {
                    log.error(`All urls failed (out of ${urls.length})`);
                    return Observable.throw(e);
                } else {
                    e.forEach(({e}) => { log.warn('Some but not all urls failed:', e); });
                    return Observable.from([df]);
                }
            })

        return df.map((df) => ({
                app,
                pivot: {
                    ...pivot,
                    connections: (nodes && nodes.value ? nodes.value : nodes) || [],
                    attributes: (attributes && attributes.value ? attributes.value : attributes) || [],
                    df: df,
                    resultCount: df ? df.count() : 0,//really want shaped..
                    template: this,
                    events: df ? df.toCollection() : [],
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



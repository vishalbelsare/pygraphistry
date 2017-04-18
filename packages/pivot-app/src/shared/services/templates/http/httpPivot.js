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
import { dfUnion } from '../../shape/df.js';
const log = logger.createLogger(__filename);





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
        log.debug('http searchAndShape', {
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
                log.debug('searchAndShape http: url', {url});
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
                    .map((df) => ({df}))
                    .catch((e) => Observable.of({e: e ? e : new Error('GenericHttpGetException')}));

            })
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
                log.trace('searchAndShape out pivot', pivot);
            });
    }

}



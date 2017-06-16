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
import { graphUnion } from '../../shape/graph.js';

const log = logger.createLogger(__filename);


function checkAndFormatGraph (data) {
    const { nodes = [], edges = [] } = data;
            
    const validEdges = edges
        .filter((edge) => ('source' in edge) && ('destination' in edge))
        .map(flattenJson);

    if (!('edges' in data)) {
        throw new VError({
            name: 'MissingEdges',
            cause: new Error('MissingEdges')
        }, `Transformed result missing field "edges"`); 
    }
    if (!(edges instanceof Array)) {
        throw new VError({
            name: 'EdgesTypeError',
            cause: new Error('EdgesTypeError')
        }, `Edges should be an array`); 
    }
    if (edges.length && !validEdges.length) {
        throw new VError({
            name: 'MissingEdgeIDs',
            cause: new Error('MissingEdgeIDs')
        }, `Pivot returned ${edges.length} edges but all are missing fields "source" or "destination"`);
    }

    const validNodes = nodes
        .filter((node) => 'node' in node)
        .map(flattenJson);
    if (nodes && !(nodes instanceof Array)) {
        throw new VError({
            name: 'NodesTypeError',
            cause: new Error('NodesTypeError')
        }, `Nodes should be an array`);
    }
    if (nodes.length && !validNodes.length) {
        throw new VError({
            name: 'MissingNodeIDs',
            cause: new Error('MissingNodeIDs')
        }, `Pivot returned ${nodes.length} nodes but none have id field "node"`);
    }

    return {
        nodes: validNodes,
        edges: validEdges
    }
}

// ('table' | 'graph') * { id } * int * json
//  -> {mode, table: [ { EventID, ... } ] | graph: { nodes: [{node, ...}], edges: [{source, destination}]}}
// Turn json into a flat table or a graph
//   If a table, add a unique event ID to rows to help hyper transform
function outputToResult (mode = 'table', pivot, eventCounter, data) {    
    switch (mode) {
        case 'table': 
        {
            log.trace('searchAndShape response', data);
            const rows = 
                data instanceof Array 
                    ? data.map(flattenJson) 
                    : [flattenJson(data)];
            if (rows.length) {
                if (!('EventID' in rows[0])) {
                    for (let i = 0; i < rows.length; i++) {
                        rows[i].EventID = pivot.id + ':' + (eventCounter + i);
                    }
                }                    
            }
            return {
                mode,            
                table: new DataFrame(rows)
            };
        }
        case 'graph':
            return {
                mode,
                graph: checkAndFormatGraph(data)
            };
        default:
            throw new VError({
                name: 'InvalidParameter',
                cause: new Error('InvalidParameter'),
                info: { mode },
            }, `Output type should be "table" or "graph", received "${mode}"`);
    }
}


//["k:v", ...] U {value: ["k:v", ...]} => {"k": "v", ...}
function formatHeaders(headers=[]) {
    log.debug('headers', headers);
    const unpacked = headers.value ? headers.value : headers;
    return unpacked.reduce(
        (out, str) => {

            const split = str.indexOf(":");
            if (split === -1) {
                throw new VError({
                    name: 'InvalidParameter',
                    cause: new Error('InvalidParameter'),
                    info: { header: str }
                }, `Headers should be of form "key:value", received "${str}"`);
            }

            const k = str.slice(0, split);
            const v = str.slice(split + 1);
            return {...out, [k]: v};

        },
        {});
}

// param -> undefined U number ; InvalidParameter
// Pulls out timeout in seconds
function formatTimeout(timeS) {

    const unwrapped = (timeS instanceof Object) && ('value' in timeS) ? timeS.value : timeS;
    if (unwrapped === undefined) {
        return undefined;
    }

    const coerced = Number(unwrapped);
    if (coerced > 0) {
        return Math.ceil(coerced);
    } else {
        throw new VError({
            name: 'InvalidParameter',
            cause: new Error('InvalidParameter'),
            info: { time: unwrapped }
        }, `Timeout should be a number (seconds) like "10", received "${unwrapped}"`);
    }
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
        const { jq, nodes, attributes, outputType, method, headers, timeout } = params;

        const headersProcessed = formatHeaders(headers);
        const timeoutProcessed = formatTimeout(timeout);

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
        const out = Observable.from(urls)
            .flatMap((maybeUrl) => {

                if (maybeUrl instanceof Error) {
                    log.error('HTTP GET received an Error url', maybeUrl);
                    return Observable.of({e: maybeUrl});
                }

                const { url, body, params } = maybeUrl;
                log.debug('searchAndShape http: url', { url, headersProcessed, timeoutProcessed });                
                return this.connector.search(url, { method, body, headers: headersProcessed, timeout: timeoutProcessed })                    
                    .switchMap(([response]) => {
                        log.debug('response', JSON.stringify((response||{}).body).slice(0,1000));
                        return jqSafe(response.body, template(jq || '.', params))
                            .do((response) => log.debug('jq response', response))
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
                    .map((response) =>
                        outputToResult(outputType, pivot, eventCounter, response))
                    .do(({table, graph}) => {
                        log.debug('transformed output', {table, graph});
                        if (table) {
                            eventCounter += table.count();
                        }
                    })
                    .catch((e) => Observable.of({e: e ? e : new Error('GenericHttpGetException')}));

            })
            .reduce((acc, {table, graph, e}) => ({
                    table: dfUnion(acc.table, table),
                    graph: graphUnion(acc.graph, graph),
                    e: e ? acc.e.concat([e]) : acc.e
                }),
                {table: undefined, graph: undefined, e: []})
            .last()
            .flatMap(({table, graph, e}) => {
                if (e.length && (e.length === urls.length)) {
                    log.error(`All urls failed (out of ${urls.length})`);
                    return Observable.throw(e);
                } else {
                    e.forEach(({e}) => { log.warn('Some but not all urls failed:', e); });
                    return Observable.from([{table, graph}]);
                }
            })

        return out.map(({table, graph}) => ({
                app,
                pivot: {
                    ...pivot,
                    connections: (nodes && nodes.value ? nodes.value : nodes) || [],
                    attributes: (attributes && attributes.value ? attributes.value : attributes) || [],
                    resultCount: 
                        //really want shaped..
                        table ? table.count() 
                            : graph ? (graph.nodes||[]).length + (graph.edges||[]).length
                            : 0,
                    template: this,
                    df: table || new DataFrame([[]]),
                    events: table ? table.toCollection() : [],
                    graph: graph,
                    results: {
                        graph: [],
                        labels: []
                    }
                }
            }))
            .map(shapeSplunkResults)
            .do(({pivot: realPivot}) => {
                log.debug('shaped results', realPivot.results);
                for (const i in realPivot) {
                    pivot[i] = realPivot[i];
                }
                log.info('results', pivot.resultCount);
                pivotCache[pivot.id] = { params, results: pivot.results };
                log.trace('searchAndShape out pivot', pivot);
            });
    }

}



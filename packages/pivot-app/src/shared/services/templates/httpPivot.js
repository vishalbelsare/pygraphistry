import { DataFrame } from 'dataframe-js';
import { Observable } from 'rxjs';
import stringhash from 'string-hash';
import { run } from 'node-jq';
import { VError } from 'verror'

import { shapeSplunkResults } from '../shapeSplunkResults.js';
import { PivotTemplate } from './template.js';
import { httpConnector0 } from '../connectors/http';
import logger from '../../../shared/logger.js';
const log = logger.createLogger(__filename);


//{x: {y: 1}} => {"x.y": 1}
//http://stackoverflow.com/questions/19098797/fastest-way-to-flatten-un-flatten-nested-json-objects
function flattenJson (data) {
    const result = {};
    function recurse (cur, prop) {
        if (Object(cur) !== cur) {
            result[prop] = cur;
        } else if (Array.isArray(cur)) {
            let l = cur.length;
            for(let i=0; i<l; i++)
                 recurse(cur[i], prop + "[" + i + "]");
            if (l === 0)
                result[prop] = [];
        } else {
            let isEmpty = true;
            for (let p in cur) {
                isEmpty = false;
                recurse(cur[p], prop ? prop+"."+p : p);
            }
            if (isEmpty && prop)
                result[prop] = {};
        }
    }
    recurse(data, "");
    return result;
}

class HttpPivot extends PivotTemplate {
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

        const df = this.toUrls(params, pivotCache)
            .flatMap((url) => {
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
                    .do((x) => log.trace('jq out', x))
                    .map((response) => {
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
                for (let i in realPivot) pivot[i] = realPivot[i];
                log.info('results', pivot.results);
                pivotCache[pivot.id] = { params,  results: pivot.results };
            })
            .do(() => log.trace('searchAndShape http'));

    }

}

const PARAMETERS = [
    {
        name: 'endpoint',
        inputType: 'text',
        label: 'URL:',
        placeholder: 'http://'
    },
    {
        name: 'jq',
        inputType: 'text',
        label: 'Postprocess with jq:',
        placeholder: '.'
    },
    {
        name: 'nodes',
        inputType: 'multi',
        label: 'Nodes:',
        options: [],
    },
    {
        name: 'attributes',
        inputType: 'multi',
        label: 'Attributes:',
        options: [],
    }
];



function bindTemplateString (str, event, params) {
    return str.split(/({.*?})/) // x={...}&y={...} => ['x=','{...}','&y=','{...}']
        .map((arg) => {
            if ((arg.length > 2) && (arg[0] === '{') && (arg[arg.length - 1] === '}')) {
                const name = arg.slice(1,-1).trim();
                if (name in params) {
                    return params[name];
                } else if (name in event) {
                    return event[name];
                } else {
                    log.error('Template parameter not found in event, pivot params', {str,name});
                    throw new VError({
                        name: 'Template parameter not found in event, pivot params',
                        info: { str, name },
                    }, 'Failed to run jq post process', { str, name });
                }
            } else {
                return arg;
            }
        }).join('');
}

export const HTTP_SEARCH = new HttpPivot({
    id: 'http-search',
    name: 'Search through a URL',
    tags: ['Demo', 'Splunk'],
    attributes: [ ],
    connections: [ ],    
    toUrls: function ({ endpoint, nodes, attributes }) {

        //update dropdown optionlists
        this.connections = nodes ? nodes.value : [];
        this.attributes = attributes ? attributes.value : [];

        const url = bindTemplateString(endpoint, {}, {
            endpoint, 
            nodes: this.connections,
            attributes: this.attributes
        });

        return Observable.of(url);
    },
    parameters: PARAMETERS,
    encodings: {
        point: {
            pointColor: (node) => {
                node.pointColor = stringhash(node.type) % 12;
            }
        }
    }
});

export const HTTP_EXPAND = new HttpPivot({
    id: 'http-expand',
    name: 'Expand with a URL',    
    tags: ['Demo', 'Splunk'],
    attributes: [ ],
    connections: [ ],    
    parameters:
        [{
            name: 'pRef',
            inputType: 'pivotCombo',
            label: 'Any event in:',
        }].concat(PARAMETERS),
    toUrls: function ({ endpoint = '', nodes, attributes, pRef }, pivotCache) {

        const refVal = pRef ? pRef.value : '';

        //update dropdown optionlists
        this.connections = nodes ? nodes.value : [];
        this.attributes = attributes ? attributes.value : [];

        log.info('pivot refVal', refVal);

        const pivots = refVal instanceof Array ? refVal : [refVal];
        return Observable.from(pivots)
            .map((refVal) => pivotCache[refVal].events)
            .flatMap((events) => Observable.from(events))
            .map((row, i) => {
                log.info('row', i, row);                
                const url = bindTemplateString(endpoint, row, {
                    endpoint, 
                    nodes: this.connections,
                    attributes: this.attributes
                });
                log.info('row endpoint', url);
                return url;
            });

    },
    encodings: {
        point: {
            pointColor: (node) => {
                node.pointColor = stringhash(node.type) % 12;
            }
        }
    }
});




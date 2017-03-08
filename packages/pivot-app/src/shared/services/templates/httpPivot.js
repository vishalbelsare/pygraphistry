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
    var result = {};
    function recurse (cur, prop) {
        if (Object(cur) !== cur) {
            result[prop] = cur;
        } else if (Array.isArray(cur)) {
             for(var i=0, l=cur.length; i<l; i++)
                 recurse(cur[i], prop + "[" + i + "]");
            if (l == 0)
                result[prop] = [];
        } else {
            var isEmpty = true;
            for (var p in cur) {
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

        const { toUrl, connections, encodings, attributes, connector } = pivotDescription;
        this.toUrl = toUrl;
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
        const { endpoint, jq } = params;

        const url = this.toUrl(params, pivotCache);
        
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
                        for (var i = 0; i < rows.length; i++) {
                            rows[i].EventID = pivot.id + ':' + i;
                        }
                    }                    
                }
                return new DataFrame(rows);
            })
            .map((df) => ({
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
            .do(({app, pivot: realPivot}) => {
                for (var i in realPivot) pivot[i] = realPivot[i];
                log.info('results', pivot.results);
                pivotCache[pivot.id] = { params,  results: pivot.results };
            })
            .do(({app, pivot}) => log.trace('searchAndShape http', url, pivot));

    }

}

const JQ_PARAMETER = {
    name: 'jq',
    inputType: 'text',
    label: 'Postprocess with jq:',
    placeholder: '.'
};

export const HTTP_SEARCH = new HttpPivot({
    id: 'http-search',
    name: 'Search through a URL',
    tags: ['Demo', 'Splunk'],
    attributes: [ ],
    connections: [ ],    
    toUrl: function ({ endpoint, nodes, attributes }) {
        this.connections = nodes ? nodes.value : [];
        this.attributes = attributes ? attributes.value : [];
        return endpoint;
    },
    parameters: [
        {
            name: 'endpoint',
            inputType: 'text',
            label: 'URL:',
            placeholder: 'http://'
        },
        JQ_PARAMETER,
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
    ],
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
    parameters: [
        {
            name: 'endpoint',
            inputType: 'text',
            label: 'URL:',
            placeholder: 'http://'
        },    
        {
            name: 'pRef',
            inputType: 'pivotCombo',
            label: 'Any event in:',
        },
        JQ_PARAMETER
    ],
    toRequest: ({ endpoint }, pivotCache) =>  endpoint,
    encodings: {
        point: {
            pointColor: (node) => {
                node.pointColor = stringhash(node.type) % 12;
            }
        }
    }
});




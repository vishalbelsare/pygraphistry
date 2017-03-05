import _ from 'underscore';
import { Observable } from 'rxjs';
import request from 'request';
import { run } from 'node-jq';
import { VError } from 'verror'
const get = Observable.bindNodeCallback(request.get.bind(request));

import { PivotTemplate } from './template.js';
import { httpConnector0 } from '../connectors/http';
import { shapeSplunkResults } from '../shapeSplunkResults.js';
import logger from '../../../shared/logger.js';
const log = logger.createLogger(__filename);


class HttpPivot extends PivotTemplate {
    constructor( pivotDescription ) {
        super(pivotDescription);

        const { connections, encodings, attributes, connector } = pivotDescription;
        this.connections = connections;
        this.encodings = encodings;
        this.attributes = attributes;
        this.connector = connector || httpConnector0;
    }

    searchAndShape({ app, pivot }) {

        const { endpoint, jq } = this.stripTemplateNamespace(pivot.pivotParameters);

        return get(endpoint)
            .catch((e) => {
                return Observable.throw(
                    new VError({
                        name: 'HttpGetError',
                        cause: e,
                        info: { endpoint },
                    }, 'Failed to make http request', endpoint)
                );
            })
            //.timeout(20 * 1000, new Error({'msg': 'Timeout', endpoint}))
            .switchMap(([response]) => {

                if (!response || response.statusCode !== 200) {
                    const info = { endpoint, statusCode: (response||{}).statusCode };
                    return Observable.throw(
                            new VError({
                                name: 'HttpStatusError',
                                cause: e,
                                info: info,
                            }, 'URL gave an unexpected response code', info));
                }

                return Observable
                    .fromPromise(run(jq || '.', response.body, { input: 'string', output: 'json'}))
                    .catch((e) => {
                        return Observable.throw(
                            new VError({
                                name: 'HttpJqError',
                                cause: e,
                                info: { endpoint, jq },
                            }, 'Failed to post process', { endpoint, jq }));
                    })
            })
            .do((x) => log.info('jq out', x))
            .map(() => ({
                app,
                pivot: {
                    template: this,
                    results: {
                        graph: [],
                        labels: []
                    },
                    ...pivot
                }
            }))
            .do(() => log.info('searchAndShape http', endpoint));

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
    parameters: [
        {
            name: 'endpoint',
            inputType: 'text',
            label: 'URL:',
            placeholder: 'http://'
        },
        JQ_PARAMETER
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
    connections: [ ],
    encodings: {
        point: {
            pointColor: (node) => {
                node.pointColor = stringhash(node.type) % 12;
            }
        }
    }
});




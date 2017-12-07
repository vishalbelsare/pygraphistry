import { Client as es_client } from 'elasticsearch';
import { Observable } from 'rxjs';
import VError from 'verror';

import logger from 'pivot-shared/logger';
import { Connector } from './connector.js';

const conf = global.__graphistry_convict_conf__;

export function toGraph(records) {
    const nodes = [];
    const edges = [];
    records.records.forEach(function(record) {
        record.forEach(function(v) {
            const item = {};

            const maybeTitle = v.properties
                ? 'name' in v.properties
                  ? v.properties.name
                  : 'title' in v.properties ? v.properties.title : undefined
                : undefined;

            if ('type' in v) {
                item.type = v.type;
            } else if (v.labels && v.labels.length) {
                item.type = v.labels[0];
            }
            if (v.constructor.name === 'Node') {
                item.node = v.identity.toString();
                item.pointTitle = maybeTitle === undefined ? item.id : maybeTitle;
                nodes.push(item);
            } else {
                item.source = v.start.toString();
                item.destination = v.end.toString();
                edges.push(item);
            }
            if (v.labels) {
                v.labels.forEach(function(label) {
                    item[label] = true;
                });
            }
            if (v.properties) {
                for (const i in v.properties) {
                    if (v.properties[i] && v.properties[i].constructor.name === 'Integer') {
                        item[i] = v.properties[i].toNumber();
                    } else {
                        item[i] = v.properties[i];
                    }
                }
            }
        });
    });
    return { nodes, edges };
}

class ElasticsearchConnector extends Connector {
    constructor(config) {
        super(config);

        this.client = new es_client({ host: config.host, log: config.logLevel });

        this.log = logger.createLogger(__filename).child(metadata);
    }

    healthCheck() {
        return Observable.of(1)
            .switchMap(() => {
                const session = this.client;
                return Observable.fromPromise(session.ping({ requestTimeout: 5000 }))
                    .timeout(5000)
                    .finally(() => session.close());
            })
            .map(() => 'Health checks passed')
            .catch(exn =>
                Observable.throw(
                    new VError({
                        name: 'ConnectionError',
                        cause: exn instanceof Error ? exn : new Error(exn),
                        info: this.metadata
                    })
                )
            )
            .take(1);
    }

    search(query) {
        this.log.info('Running Elasticsearch query', query);

        return Observable.of(1)
            .switchMap(() => {
                const session = this.client;
                return Observable.fromPromise(session.search(query))
                    .timeout(30000)
                    .finally(() => session.close());
            })
            .map(records => {
                const { nodes, edges } = toGraph(records);
                return {
                    resultCount: nodes.length + edges.length,
                    isPartial: false,
                    graph: { nodes, edges }
                };
            });
    }
}

ElasticsearchConnector.searchParamDefaults = {};

export const elasticsearchConnector0 = new ElasticsearchConnector({
    id: 'elasticsearch-connector',
    name: 'Elasticsearch'
});

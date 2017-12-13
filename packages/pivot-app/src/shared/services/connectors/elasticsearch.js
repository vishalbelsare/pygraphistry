import { Client as es_client } from 'elasticsearch';
import { Observable } from 'rxjs';
import VError from 'verror';

import logger from 'pivot-shared/logger';
import { Connector } from './connector.js';
const log = logger.createLogger(__filename);

const conf = global.__graphistry_convict_conf__;

export function toGraph(records) {
    const nodes = [];
    const edges = [];
    records.hits.hits.forEach(function(v) {
        const item = {};

        const maybeTitle = v._source
            ? 'name' in v._source
              ? v._source.name
              : 'title' in v._source ? v._source.title : undefined
            : undefined;

        if ('_type' in v) {
            item.type = v._type;
        } else if (v.labels && v.labels.length) {
            item.type = v.labels[0];
        }
        if (v._source.source === 'stdout') {
            item.Pivot = 0;
            item.node = v._source.container_name;
            item.pointTitle = v._source['@log_name'];
            nodes.push(item);

            item.source = v._source.container_name;
            item.destination = v._source.container_name;
            edges.push(item);
        }
        if (v.labels) {
            v.labels.forEach(function(label) {
                item[label] = true;
            });
        }
        if (v._source) {
            for (const i in v._source) {
                if (v._source[i] && v._source[i].constructor.name === 'Integer') {
                    item[i] = v._source[i].toNumber();
                } else {
                    item[i] = v._source[i];
                }
            }
        }
    });
    return { nodes, edges };
}

class ElasticsearchConnector extends Connector {
    constructor(config) {
        super(config);
        const metadata = { host: config.host + ':' + config.port, log: config.logLevel };
        this.client = new es_client(metadata);

        this.log = logger.createLogger(__filename).child(this.metadata);
    }

    search(args) {
        const query = {
            index: args.index,
            body: JSON.parse(args.query)
        };
        this.log.info('Running Elasticsearch query', query);
        this.log.info('Running Elasticsearch Index', args.index);

        return Observable.of(1)
            .switchMap(() => {
                const session = this.client;
                return Observable.fromPromise(session.search(query)).timeout(30000);
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

    healthCheck() {
        return Observable.of(1)
            .switchMap(() => {
                const session = this.client;
                return Observable.fromPromise(session.ping({ requestTimeout: 5000 })).timeout(5000);
                //.finally(() => session.close());
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
}

ElasticsearchConnector.searchParamDefaults = {};

export const elasticsearchConnector0 = new ElasticsearchConnector({
    id: 'elasticsearch-connector',
    name: 'Elasticsearch',
    host: conf.get('elasticsearch.host'),
    port: conf.get('elasticsearch.port')
});

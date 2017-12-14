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
    records.hits.hits.forEach(function(record) {
        const item = {};

        const maybeTitle = record._source
            ? 'EventID' in record._source
              ? record._source.EventID
              : '_title' in record ? record._source._title : undefined
            : undefined;

        item.type = record._type;
        if (record._type === 'node') {
            item.node = record._id;
            item.pointTitle = maybeTitle === undefined ? item._id : maybeTitle;
            nodes.push(item);
        } else {
            item.source = record._source.Source;
            item.destination = record._source.Destination;
            edges.push(item);
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
                    events: records,
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

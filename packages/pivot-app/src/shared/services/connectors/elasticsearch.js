import { Client as es_client } from 'elasticsearch';
import { Observable } from 'rxjs';
import VError from 'verror';

import logger from 'pivot-shared/logger';
import { Connector } from './connector.js';

const conf = global.__graphistry_convict_conf__;

class ElasticsearchConnector extends Connector {
    constructor(config) {
        super(config);

        this.client = es_client({ host: 'localhost:9200', log: config.logLevel });

        this.log = logger.createLogger(__filename).child(metadata);
    }

    healthCheck() {
        return Observable.of(1)
            .switchMap(() => {
                const session = new this.client();
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

    search(query) {
        this.log.info('Running Elasticsearch query', query);

        return Observable.of(1)
            .switchMap(() => {
                const session = new this.client();
                return Observable.fromPromise(session.search(query)).timeout(30000);
                //.finally(() => session.close());
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

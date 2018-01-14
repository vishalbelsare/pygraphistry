import { Client } from 'elasticsearch';
import { Observable } from 'rxjs';
import VError from 'verror';

import logger from 'pivot-shared/logger';
import { Connector } from './connector.js';
const log = logger.createLogger(__filename);

const conf = global.__graphistry_convict_conf__;

function processEsEvents(records) {
    const events = [];

    records.hits.hits.forEach(event => {
        events.push(event._source);
    });

    return events;
}

function columnsToRows({ fields, columns }) {
    if (!columns.length || !columns[0].length) {
        return [];
    }

    const rows = [];
    const height = columns[0].length;
    for (let row = 0; row < height; row++) {
        const event = {};
        fields.forEach((name, col) => {
            const v = columns[col][row];
            if (v !== null) {
                event[name] = v;
            }
        });
        rows.push(event);
    }

    return rows;
}

class ElasticsearchConnector extends Connector {
    constructor(config) {
        super(config);
        const metadata = { host: config.host + ':' + config.port, log: config.logLevel };
        this.client = new Client(metadata);

        this.log = logger.createLogger(__filename).child(this.metadata);
    }

    search(searchQuery, searchParams) {
        this.log.info('Running Elasticsearch query', searchQuery);

        return Observable.of(1)
            .switchMap(() => {
                const session = this.client;
                return Observable.fromPromise(session.search(searchQuery)).timeout(30000);
            })
            .map(processEsEvents);
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

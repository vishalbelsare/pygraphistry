import { v1 as neo4j } from 'neo4j-driver';
import { Observable } from 'rxjs';

import conf from '../../../server/config.js';
import logger from '../../../shared/logger.js';
import { Connector } from './connector.js';



import { DataFrame } from 'dataframe-js';
import objectHash from 'object-hash';
import VError from 'verror';

function toGraph(records) {
    var nodes = [];
    var edges = [];
    console.log('---- GOT', records);
    records.records.forEach(function (record) {
        record.forEach(function (v) {
            var item = {}; 
            
            const maybeTitle =
                v.properties ?
                    ('name' in v.properties ? v.properties.name
                     : 'title' in v.properties ? v.properties.title 
                     : undefined)
                : undefined;
                
            if ('type' in v) {
                item.type = v['type'];
            } else if (v.labels && v.labels.length) {
                item.type = v.labels[0];
            }            
            if (v.constructor.name === 'Node') {            
                item.id = v.identity.toString();
                item.pointTitle = maybeTitle === undefined ? item.id : maybeTitle;
                nodes.push(item);                
            } else {
                item.source = v.start.toString();
                item.destination = v.end.toString();
                edges.push(item);
            }
            if (v.labels) {
                v.labels.forEach(function (label) { 
                    item[label] = true;
                });
            }
            if (v.properties) {
                for (var i in v.properties) {
                    if (v.properties[i] && v.properties[i].constructor.name === 'Integer') {
                        item[i] = v.properties[i].toNumber();   
                    } else {
                        item[i] = v.properties[i];
                    }
                }
            }
        });
    });
    return {nodes, edges}
}



class Neo4jConnector extends Connector {
    constructor(config) {
        super(config);

        this.driver = neo4j.driver(
            config.bolt,
            neo4j.auth.basic(config.user, config.password));

        
        const metadata = { neo4jServer: config.bolt, neo4jUser: config.user };
        this.log = logger.createLogger(__filename).child(metadata);        

    }

    healthCheck() {
        return Observable.of(1)
            .switchMap(() => {
                const session = this.driver.session();
                return Observable
                    .fromPromise(session.run('match (n) return n limit 1'))
                    .timeout(5000)
                    .finally(() => session.close())
            })
            .map(() => 'Health checks passed')
            .catch((exn) =>
                Observable.throw(
                    new VError({
                        name: 'ConnectionError',
                        cause: exn instanceof Error ? exn : new Error(exn),
                        info: this.metadata,                        
                    })))
            .take(1)

    }

    search(query, searchParamOverrides = {}) {

        this.log.info('neo4j connector start')

        // Set the splunk search parameters
        const searchParams = {
            ...Neo4jConnector.searchParamDefaults,
            ...searchParamOverrides
        };

        return Observable.of(1)
            .do(() => this.log.info('neo4j connector observable start'))
            .switchMap(() => {
                const session = this.driver.session();
                return Observable
                    .fromPromise(session.run(query))
                    .do((v) => console.info('raw query out', v))
                    .timeout(30000)
                    .finally(() => session.close());
            })
            .map((records) => {
                const { nodes, edges } = toGraph(records);
                this.log.info('nodes', nodes);
                this.log.info('edges', edges);
                return {
                    resultCount: nodes.length + edges.length,
                    isPartial: false,
                    graph: {nodes, edges}
                };
            });
    }
}

Neo4jConnector.searchParamDefaults = { };


export const neo4jConnector0 = new Neo4jConnector({
    id:'neo4j-connector',
    name : 'Neo4j',
    bolt: conf.get('neo4j.bolt'),
    user: conf.get('neo4j.user'),
    password: conf.get('neo4j.password')
});

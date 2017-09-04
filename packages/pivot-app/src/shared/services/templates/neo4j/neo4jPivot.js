import _ from 'underscore';
import { Observable } from 'rxjs';
import logger from '../../../../shared/logger.js';
const log = logger.createLogger(__filename);


import { PivotTemplate } from '../template.js';
import { neo4jConnector0 } from '../../connectors';
import { shapeResults } from '../../shapeResults.js';

export class Neo4jPivot extends PivotTemplate {
    constructor( pivotDescription ) {

        super(pivotDescription);

        const { toNeo4j, connections, encodings, attributes } = pivotDescription;
        this.toNeo4j = toNeo4j;
        this.connections = connections;
        this.encodings = encodings;
        this.attributes = attributes;
        this.connector = neo4jConnector0;
    }

    searchAndShape({ app, pivot, pivotCache }) {

        const args = this.stripTemplateNamespace(pivot.pivotParameters);
        const query = this.toNeo4j(args, pivotCache);
        log.trace({pivotParameters: pivot.pivotParameters, args}, 'Pivot parameters');
        pivot.template = this;

        if (!pivot.enabled) {
            pivot.resultSummary = {};
            pivot.resultCount = 0;
            return Observable.of({ app, pivot });
        } else {

            return this.connector.search(query)
                .do(({ resultCount, graph, isPartial }) => {
                    pivot.resultCount = resultCount;
                    pivot.graph = graph;
                    pivot.isPartial = isPartial;
                    pivot.connections = this.connections;
                    pivot.attributes = this.attributes;
                    pivotCache[pivot.id] = {
                        results: pivot.results,
                        query: query
                    };
                })
                .map(() => shapeResults({app, pivot}))
                .do(({pivot: pivotShaped}) => {
                    pivot.results = pivotShaped.results;
                });
        }
    }

}
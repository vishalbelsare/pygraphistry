import { Observable } from 'rxjs';
import logger from '../../../../shared/logger.js';
const log = logger.createLogger(__filename);

import { PivotTemplate } from '../template.js';
import { elasticsearchConnector0 } from '../../connectors';
import { shapeResults } from '../../shapeResults.js';

export class ElasticsearchPivot extends PivotTemplate {
    constructor(pivotDescription) {
        super(pivotDescription);

        const { toES, connections, encodings, attributes } = pivotDescription;
        this.toES = toES;
        this.connections = connections;
        this.encodings = encodings;
        this.attributes = attributes;
        this.connector = elasticsearchConnector0;
    }

    searchAndShape({ app, pivot, pivotCache }) {
        const args = this.stripTemplateNamespace(pivot.pivotParameters);
        const query = this.toES(args, pivotCache);
        log.trace({ pivotParameters: pivot.pivotParameters, args }, 'Pivot parameters');
        pivot.template = this;

        if (!pivot.enabled) {
            pivot.resultSummary = {};
            pivot.resultCount = 0;
            return Observable.of({ app, pivot });
        } else {
            return this.connector
                .search(query)
                .do(({ resultCount, graph, isPartial }) => {
                    pivot.resultCount = resultCount;
                    pivot.graph = graph;
                    pivot.isPartial = isPartial;
                    pivot.connections = this.connections;
                    pivot.attributes = this.attributes;
                })
                .map(() => shapeResults({ app, pivot }))
                .do(({ pivot: pivotShaped }) => {
                    pivotCache[pivot.id] = {
                        results: pivotShaped.results,
                        query: query
                    };
                    pivot.results = pivotShaped.results;
                });
        }
    }
}

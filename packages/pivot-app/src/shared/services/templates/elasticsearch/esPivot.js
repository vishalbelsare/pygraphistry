import { Observable } from 'rxjs';
import moment from 'moment-timezone';
import logger from 'pivot-shared/logger';
import { VError } from 'verror';
const log = logger.createLogger(__filename);

import { jqSafe, isJqSafe } from '../../support/jq';
import { template } from '../../support/template';
import { graphUnion } from '../../shape/graph.js';
import { outputToResult } from '../../shape/preshape.js';
import { PivotTemplate } from '../template.js';
import { elasticsearchConnector0 } from '../../connectors';
import { shapeResults } from '../../shapeResults.js';
import {
    fieldsBlacklist,
    entitiesBlacklist,
    attributesBlacklist as attributesBlacklistSettings
} from '../splunk/settings.js';

export class EsPivot extends PivotTemplate {
    constructor(pivotDescription) {
        super(pivotDescription);

        const {
            toES,
            connections,
            encodings,
            attributes,
            connectionsBlacklist,
            attributesBlacklist
        } = pivotDescription;
        this.toES = toES;
        this.connections = connections;
        this.connectionsBlacklist = connectionsBlacklist || entitiesBlacklist;
        this.encodings = encodings;
        this.attributes = attributes;
        this.attributesBlacklist = attributesBlacklist || attributesBlacklistSettings;
        this.connector = elasticsearchConnector0;
    }

    searchAndShape({ app, pivot, pivotCache, time }) {
        const args = this.stripTemplateNamespace(pivot.pivotParameters);
        const { jq, outputType } = args;
        const { searchQuery, searchParams, searchIndex } = this.toES(args, pivotCache, { time });
        log.trace({ pivotParameters: pivot.pivotParameters, args }, 'Pivot parameters');
        pivot.template = this;

        if (isJqSafe(jq) !== true) {
            return Observable.throw(isJqSafe(jq));
        }

        let eventCounter = 0;

        if (!pivot.enabled) {
            pivot.resultSummary = {};
            pivot.resultCount = 0;
            return Observable.of({ app, pivot });
        } else {
            return this.connector
                .search(searchQuery, searchParams, searchIndex)
                .switchMap(events => {
                    if (jq === '' || jq === '.') {
                        return Observable.of(events);
                    } else {
                        return jqSafe(JSON.stringify(events), template(jq || '.', args))
                            .do(response => log.info('jq response', response))
                            .catch(e => {
                                log.error('jq error', { jq, e });
                                return Observable.throw(
                                    new VError(
                                        {
                                            name: 'JqRuntimeError',
                                            cause: e,
                                            info: { jq }
                                        },
                                        'Failed to run jq post process',
                                        { jq }
                                    )
                                );
                            });
                    }
                })
                .do(response => log.info('pre shape', response))
                .map(response => outputToResult(outputType, pivot, eventCounter, response))
                .catch(e => {
                    log.error('wat1', e);
                    return Observable.throw({ e: e ? e : new Error('GenericHttpGetException') });
                })
                .do(({ table, graph }) => {
                    log.info('table #', (table || []).length);
                    log.info('transformed output', { table, graph });
                    if (table) {
                        eventCounter += table.length;
                    }
                })
                .catch(e => {
                    log.error('wat2', e);
                    return Observable.throw({ e: e ? e : new Error('GenericHttpGetException') });
                })
                .reduce(
                    (acc, { table, graph, e }) => ({
                        table: acc.table ? acc.table.concat(table || []) : table,
                        graph: graphUnion(acc.graph, graph),
                        e: e ? acc.e.concat([e]) : acc.e
                    }),
                    { table: undefined, graph: undefined, e: [] }
                )
                .last()
                .do(({ table, graph }) => {
                    log.info('# table reduced', (table || []).length);
                    pivot.resultCount = table
                        ? table.length
                        : graph ? (graph.nodes || []).length + (graph.edges || []).length : 0;
                    pivot.events = table || [];
                    pivot.graph = graph;
                    pivot.isPartial = false;
                    pivot.connections = this.connections;
                    pivot.connectionsBlacklist =
                        this.connections && this.connections.length
                            ? []
                            : this.connectionsBlacklist;
                    pivot.attributes = this.attributes;
                    pivot.attributesBlacklist =
                        this.attributes && this.attributes.length ? [] : this.attributesBlacklist;
                })
                .map(() => shapeResults({ app, pivot }))
                .do(({ pivot: pivotShaped }) => {
                    pivotCache[pivot.id] = {
                        results: pivotShaped.results,
                        query: searchQuery
                    };
                    pivot.results = pivotShaped.results;
                });
        }
    }
}

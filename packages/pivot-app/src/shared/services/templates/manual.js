import { DataFrame } from 'dataframe-js';
import { Observable } from 'rxjs';
import { VError } from 'verror'

import { shapeSplunkResults } from '../shapeSplunkResults.js';
import { PivotTemplate } from './template.js';
import { flattenJson } from '../support/flattenJson.js';
import logger from '../../../shared/logger.js';
const log = logger.createLogger(__filename);

import { demoEncodings } from './http/common.js';


class ManualPivot extends PivotTemplate {
    constructor( pivotDescription ) {
        super(pivotDescription);

        const { connections, encodings, attributes } = pivotDescription;
        this.connections = connections;
        this.encodings = encodings;
        this.attributes = attributes;

    }

    searchAndShape({ app, pivot, pivotCache }) {

        pivot.template = this;

        //TODO why isn't this in the caller?
        if (!pivot.enabled) {
            pivot.resultSummary = {};
            pivot.resultCount = 0;
            return Observable.of({ app, pivot });
        }

        const params = this.stripTemplateNamespace(pivot.pivotParameters);
        log.info({
            params,
            pivotParameters: pivot.pivotParameters
        });
        const { events, nodes, attributes } = params;

        //TODO why isn't this in falcor?
        this.connections = nodes ? nodes.value : [];
        this.attributes = attributes ? attributes.value : [];

        const a = Observable.of('')
            .map(() => {
                try {
                    const json = JSON.parse(events);
                    const rows = json instanceof Array 
                        ? json.map(flattenJson) 
                        : [flattenJson(json)];
                    if (rows.length) {
                        if (!('EventID' in rows[0])) {
                            for (let i = 0; i < rows.length; i++) {
                                rows[i].EventID = pivot.id + ':' + i;
                            }
                        }                    
                    }
                    return rows;
                } catch (e) {
                    throw new VError({
                            name: 'JsonParseError',
                            cause: e,
                            info: { e },
                        }, 'Failed to parse JSON', { events });
                }
            })
        return a
            .map((rows) => new DataFrame(rows))
            .map((df) => ({
                app,
                pivot: {
                    ...pivot,
                    df: df,
                    resultCount: df.count(),//really want shaped..
                    template: this,
                    events: df.toCollection(),
                    results: {
                        graph: [],
                        labels: []
                    }
                }
            }))
            .map(shapeSplunkResults)
            .do(({pivot: realPivot}) => {
                for (const i in realPivot) {
                    pivot[i] = realPivot[i];
                }
                log.info('results', pivot.results);
                pivotCache[pivot.id] = { params, results: pivot.results };
            })
            .do(() => log.trace('searchAndShape manual'));
    }
}

export const MANUAL = new ManualPivot({
    id: 'manual-data',
    name: 'Enter data',
    tags: ['Demo', 'Splunk'],
    attributes: [ ],
    connections: [ ],    
    parameters: [
        {
            name: 'events',
            inputType: 'textarea',
            label: 'Events (json)'
        },
        {
            name: 'nodes',
            inputType: 'multi',
            label: 'Nodes:',
            options: [],
        },
        {
            name: 'attributes',
            inputType: 'multi',
            label: 'Attributes:',
            options: [],
        }
    ],
    encodings: demoEncodings
});
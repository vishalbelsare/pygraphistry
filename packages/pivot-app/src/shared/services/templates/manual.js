import { DataFrame } from 'dataframe-js';
import { Observable } from 'rxjs';

import { shapeResults } from '../shapeResults.js';
import { PivotTemplate } from './template.js';
import { flattenJson } from '../support/flattenJson.js';
import { template } from '../support/template';
import { jqSafe } from '../support/jq';
import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);

import { encodings } from './http/common.js';

export class ManualPivot extends PivotTemplate {
  constructor(pivotDescription) {
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
    log.info('manual pivot', {
      params,
      pivotParameters: pivot.pivotParameters
    });
    const { jq = '.', events, nodes, attributes } = params;

    const a = Observable.defer(() => jqSafe(events, template(jq, params))).map(json => {
      log.debug('==== JQ TRANSFORMED JSON', json);
      const rows = json instanceof Array ? json.map(flattenJson) : [flattenJson(json)];
      if (rows.length) {
        if (!('EventID' in rows[0])) {
          for (let i = 0; i < rows.length; i++) {
            rows[i].EventID = pivot.id + ':' + i;
          }
        }
      }
      return rows;
    });

    return a
      .map(rows => new DataFrame(rows))
      .map(df => ({
        app,
        pivot: {
          ...pivot,
          df: df,
          resultCount: df.count(), //really want shaped..
          template: this,
          connections: nodes ? nodes.value : [],
          attributes: attributes ? attributes.value : [],
          events: df.toCollection(),
          results: {
            graph: [],
            labels: []
          }
        }
      }))
      .map(shapeResults)
      .do(({ pivot: realPivot }) => {
        for (const i in realPivot) {
          pivot[i] = realPivot[i];
        }
        log.debug('results', pivot.results);
        pivotCache[pivot.id] = { params, results: pivot.results };
      })
      .do(() => log.trace('searchAndShape manual'));
  }
}

export const MANUAL = new ManualPivot({
  id: 'manual-data',
  name: 'Enter data',
  tags: ['Demo', 'Splunk'],
  attributes: [],
  connections: [],
  parameters: [
    {
      name: 'events',
      inputType: 'textarea',
      label: 'Events (json)'
    },
    {
      name: 'jq',
      inputType: 'textarea',
      label: 'Postprocess with jq:',
      placeholder: '.'
    },
    {
      name: 'nodes',
      inputType: 'multi',
      label: 'Nodes:',
      options: []
    },
    {
      name: 'attributes',
      inputType: 'multi',
      label: 'Attributes:',
      options: []
    }
  ],
  encodings: encodings
});

export const pivots = [MANUAL];

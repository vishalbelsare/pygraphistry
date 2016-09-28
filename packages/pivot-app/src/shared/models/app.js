import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from '@graphistry/falcor-json-graph';

import { simpleflake } from 'simpleflakes';
import { createInvestigationModel } from '../models';
import _ from 'underscore';

const cols = [
    { name: 'Mode'},
    { name: 'Input' },
    { name: 'Search' },
    { name: 'Links' },
    { name: 'Time'}
];

export function app(_investigations = [], id = simpleflake().toJSON()) {

    const investigations = _investigations.map((inv, idx) =>
        createInvestigationModel(inv, idx)
    );

    return {
        id,
        title: 'Pivots',
        url: process.env.BLANK_PAGE || 'http://www.graphistry.com/',
        apiKey: process.env.GRAPHISTRY_API_KEY || 'd6a5bfd7b91465fa8dd121002dfc51b84148cd1f01d7a4c925685897ac26f40b',
        vizService: `${process.env.GRAPHISTRY_VIEWER || 'https://labs.graphistry.com'}/graph/graph.html?play=2000&bg=%23eeeeee&type=vgraph&info=true`,
        etlService: `${process.env.GRAPHISTRY_ETL || 'https://labs.graphistry.com'}/etl`,

        /**
         *  cols: {
         *     total: 'Total', length: 3,
         *     0: { name: 'Column A' },
         *     1: { name: 'Column B' },
         *     2: { name: 'Column C' }, ...
         *  }
         */
        cols: {
            ...cols,
            id: 'cols',
            total: 'Total',
            length: cols.length,
        },

        /**
         *  investigationsById: {
         *    'investigations-id-1': {
         *      ....
         *    }, ...
         *  }
         */
        investigationsById : investigations.reduce((investigations, investigation) => ({
            ...investigations, [investigation.id]: investigation
        }), {}),

        /**
         *  investigations: [
         *     $ref(`investigationsById['investigation-id-1']`) , ...
         *  ]
         */
        investigations: investigations.map((investigation, index) => (
            $ref(`investigationsById['${investigation.id}']`)
        )),

        selectedInvestigation: $ref(`investigationsById['${investigations[0].id}']`),

        /**
         *  pivotsById: {
         *    'pivot-id-1': {
         *       id: 'pivot-id-1',
         *       total: 0, length: 3,
         *       0: { name: 'Column A', value: 0 },
         *       1: { name: 'Column B', value: 0 },
         *       2: { name: 'Column C', value: 0 }, ...
         *    }, ...
         *  }
         */
        pivotsById: {}
    };
}

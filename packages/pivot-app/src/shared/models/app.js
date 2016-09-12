import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from '@graphistry/falcor-json-graph';

import { simpleflake } from 'simpleflakes';
import { investigation as createInvestigation } from '../models';
import _ from 'underscore';

const cols = [
    { name: 'Search' },
    { name: 'Links' },
    { name: 'Time'},
];

export function app(_investigations = [], id = simpleflake().toJSON()) {

    const investigations = _investigations.map((inv, idx) =>
        createInvestigation(inv, idx)
    );

    const pivots = _.flatten(_investigations.map((i) => i.pivots));

    return {

        id,
        title: 'Pivots',
        url: 'http://www.graphistry.com/',

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

        /**
         *  pivots: [
         *     $ref(`pivotsById['row-id-1']`) , ...
         *  ]
         */

        selectedInvestigation: $ref(`investigationsById['${investigations[0].id}']`),
        //pivots: pivots,

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
        pivotsById: pivots.reduce((prev, cur, index, array) =>  ({
            ...prev, [cur.id]: cur
        }), {})
    };
}

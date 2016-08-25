import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from 'falcor-json-graph';

import { simpleflake } from 'simpleflakes';

const cols = [
    { name: 'Search' },
    { name: 'Links' },
    { name: 'Time'},
];

export function app(rows = [], id = simpleflake().toJSON()) {
    const pivots = rows.map((row, index) => (
            $ref(`pivotsById['${row.id}']`)
        ));

    pivots.name = 'ordered';

    const pivotsInReverse = [...pivots].reverse();

    pivotsInReverse.name = 'reverse';

    const investigations = [pivots, pivotsInReverse];
    return {

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
        /*
         *
         *    openInvestigation : [
         *        $ref(`investigationById['investigation-id-1']`),
         *    ]
         *
         */
        //openInvestigation : $ref([`pivots`]),
        openInvestigation : pivots[0],

        investigationsById : investigations.reduce((inve4tigations, investigation) => ({
            ...investigations, [investigation.id]: investigation
        }), {}),

        investigations:investigations.map((investigation, index) => 
            $ref(`investigationsById['${investigation.id}']`)
        ),

        selectedPivots: $ref(`['pivots']`),

        //firstInvestigation = pivots

        /**
         *  pivots: [
         *     $ref(`pivotsById['row-id-1']`) , ...
         *  ]
         */
        pivots: pivots,

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
        pivotsById: rows.reduce((rows, row) => ({
            ...rows, [row.id]: row
        }), {})
    };
}

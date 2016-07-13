import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from 'falcor-json-graph';

import { simpleflake } from 'simpleflakes';

export function app(cols = [], rows = [], id = simpleflake().toJSON()) {
    return {

        title: 'Pivots',
        url: '/graph.html',

        total: rows.reduce((total, row) => total + row.total, 0),
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
         *  rows: [
         *     $ref(`rowsById['row-id-1']`) , ...
         *  ]
         */
        rows: rows.map((row, index) => (
            $ref(`rowsById['${row.id}']`)
        )),

        /**
         *  rowsById: {
         *    'row-id-1': {
         *       id: 'row-id-1',
         *       total: 0, length: 3,
         *       0: { name: 'Column A', value: 0 },
         *       1: { name: 'Column B', value: 0 },
         *       2: { name: 'Column C', value: 0 }, ...
         *    }, ...
         *  }
         */
        rowsById: rows.reduce((rows, row) => ({
            ...rows, [row.id]: row
        }), {})
    };
}

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
        url: 'http://staging.graphistry.com/graph/graph.html?dataset=PyGraphistry/DP3S3MNXTY&type=vgraph&viztoken=a37dd223ad09bf9f238f7b88fea91782cb46d7f9&usertag=45d0e486-pygraphistry-0.9.30&splashAfter=1468608756&info=true',
        urls: ['http://staging.graphistry.com/graph/graph.html?dataset=PyGraphistry/DP3S3MNXTY&type=vgraph&viztoken=a37dd223ad09bf9f238f7b88fea91782cb46d7f9&usertag=45d0e486-pygraphistry-0.9.30&info=true',
            'http://staging.graphistry.com/graph/graph.html?dataset=PyGraphistry/W54T3R8M66&type=vgraph&viztoken=9b40d934c7c6034bc8a67f5bc9db53d984eaf18a&usertag=45d0e486-pygraphistry-0.9.30&info=true'],

        urlIndex: 0,


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

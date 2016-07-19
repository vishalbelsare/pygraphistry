import { simpleflake } from 'simpleflakes';
import { ref as $ref } from 'falcor-json-graph';

export function row(cols, id = simpleflake().toJSON()) {
    return {
        id, ...Array
            .from(cols)
            .map((col) => ({
                ...col, value: Math.round(Math.random() * 50)
            }))
            .reduce((cols, col, index) => ({
                ...cols,
                [index]: col,
                //total: cols.total + col.value
            }), { length: cols.length, total: 0 })
    };
}

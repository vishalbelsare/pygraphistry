import { simpleflake } from 'simpleflakes';
import { ref as $ref } from 'falcor-json-graph';

export function row(cols, values = {'Data source': 'default', 'Condition': 'default', 'Time': 'default'}, id = simpleflake().toJSON()) {
    return {
        id, ...Array
            .from(cols)
            .map((col) => ({
                //...col, value: Math.round(Math.random() * 50)
                //...col, value:values[col] 
                ...col, value:values[col.name]
            }))
            .reduce((cols, col, index) => ({
                ...cols,
                [index]: col,
                //total: cols.total + col.value
            }), { length: cols.length, total: 0 })
    };
}

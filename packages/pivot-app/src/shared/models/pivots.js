import { simpleflake } from 'simpleflakes';
import { ref as $ref } from '@graphistry/falcor-json-graph';

export function pivot(cols, values = {'Search': 'Enter search query', 'Links': 'None', 'Time': '07/28/2016'}, id = simpleflake().toJSON(), enabled = false) {
    return {
        resultCount:0,
        enabled,
        id,
        length: cols.length,
        ...Array
            .from(cols)
            .map((col) => ({
                ...col, value:values[col.name]
            }))
    };
}

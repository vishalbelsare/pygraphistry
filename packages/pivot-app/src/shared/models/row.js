import { simpleflake } from 'simpleflakes';
import { ref as $ref } from 'falcor-json-graph';

export function row(cols, values = {'Data source': 'default', 'Condition': 'default', 'Time': 'default'}, id = simpleflake().toJSON()) {
    const url = values['url'];
    return {
        url, 
        id, 
        length: cols.length,
        ...Array
            .from(cols)
            .map((col) => ({
                ...col, value:values[col.name]
            }))
    };
}

import { simpleflake } from 'simpleflakes';
import { ref as $ref } from '@graphistry/falcor-json-graph';
import PivotTemplates from '../models/PivotTemplates';


export function pivot(cols, values =
    {'Search': 'Enter search query',
    'Mode': PivotTemplates.get('Search Splunk').name,
    'Input': 'Pivot 0',
    'Links': 'None',
    'Time': '07/28/2016'}, id = simpleflake().toJSON(), enabled = false) {
    return {
        resultCount:0,
        resultSummary: {entities: [], resultCount: 0},
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

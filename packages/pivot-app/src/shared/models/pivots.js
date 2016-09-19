import { simpleflake } from 'simpleflakes';
import { ref as $ref } from '@graphistry/falcor-json-graph';
import PivotTemplates from '../models/PivotTemplates';


export function pivot(cols, values =
    {'Search': 'Enter search query',
    'Mode': PivotTemplates.get('all', 'Search Splunk').name,
    'Input': 'Pivot 0',
    'Links': '*',
    'Time': '07/28/2016',
    'enabled': true
    }, id = simpleflake().toJSON()) {
    return {
        resultCount:0,
        resultSummary: {entities: [], resultCount: 0},
        enabled: values.enabled,
        id,
        length: cols.length,
        ...Array
            .from(cols)
            .map((col) => ({
                ...col, value:values[col.name]
            }))
    };
}

import { simpleflake } from 'simpleflakes';
import PivotTemplates from '../models/PivotTemplates';


function toHackyModel(pivotModel) {
    const cols = [
        { name: 'Mode'},
        { name: 'Input' },
        { name: 'Search' },
        { name: 'Links' },
        { name: 'Time'}
    ];

    return {
        ...pivotModel,
        length: cols.length,
        ...Array.from(cols).map((col) => ({
            ...col,
            value: pivotModel.pivotParameters[col.name.toLowerCase()]
        }))
    };
}

export function createPivotModel(serializedPivot) {
    const defaults = {
        id: simpleflake().toJSON(),
        enabled: false,
        pivotParameters: {
            search: 'Enter search query',
            mode: PivotTemplates.get('all', 'Search Splunk').name,
            input: 'none',
            links: '*',
            time: '09/21/2016'
        }
    }

    const normalizedPivot = {...defaults, ...serializedPivot};

    const initialSoftState = {
        status: null,
        resultCount: 0,
        resultSummary: {entities: []},
    }

    return toHackyModel({...normalizedPivot, ...initialSoftState});
}

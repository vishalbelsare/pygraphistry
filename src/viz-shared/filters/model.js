import { simpleflake } from 'simpleflakes';
import { ref as $ref, atom as $atom } from 'reaxtor-falcor-json-graph';

export function filters(workbookId, viewId, filterId = simpleflake().toJSON()) {
    const prefix = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        filters: {
            open: false,
            name: 'Filters',
            length: 1,
            0: $ref(`${prefix}.filtersById['${filterId}']`)
        },
        filtersById: {
            [filterId]: {
                id: filterId,
                title: 'Point Limit',
                attribute: undefined,
                level: 'system',
                query: {
                    type: 'point',
                    ast: {
                        type: 'Limit',
                        value: {
                            type: 'Literal',
                            dataType: 'integer',
                            value: 8e5
                        }
                    },
                    inputString: 'LIMIT 800000'
                }
            }
        },
    };
}

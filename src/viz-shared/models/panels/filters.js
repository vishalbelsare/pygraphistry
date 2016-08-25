import { simpleflake } from 'simpleflakes';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';

export function filters(workbookId, viewId, filterId = simpleflake().toJSON()) {
    const view = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        filters: {
            open: false,
            id: 'filters',
            name: 'Filters',
            length: 1, ...[
                $ref(`${view}.filtersById['${filterId}']`)
            ],
            controls: [{
                id: 'toggle-filters',
                name: 'Filters',
                type: 'toggle',
                stateKey: 'left',
                state: $ref(`${view}.panels`),
                value: $atom(undefined),
                values: $atom([$ref(`${view}.filters`), $atom(undefined)])
            }]
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

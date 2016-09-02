import { simpleflake } from 'simpleflakes';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';

export function sets(workbookId, viewId, setIds = [ simpleflake().toJSON(),
                                                    simpleflake().toJSON(),
                                                    simpleflake().toJSON() ]) {
    const view = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        sets: {
            open: false,
            id: 'sets',
            name: 'Sets',
            length: 3, ...[
                $ref(`${view}.setsById['${setIds[0]}']`),
                $ref(`${view}.setsById['${setIds[1]}']`),
                $ref(`${view}.setsById['${setIds[2]}']`)
            ],
            controls: [{
                id: 'toggle-sets',
                name: 'Sets',
                type: 'toggle',
                stateKey: 'left',
                state: $ref(`${view}.panels`),
                value: $atom(undefined),
                values: $atom([$ref(`${view}.sets`), $atom(undefined)])
            }]
        },
        setsById: {
            [setIds[0]]: {
                id: 'dataframe',
                level: 'system',
                title: 'Loaded'
            },
            [setIds[1]]: {
                id: 'filtered',
                level: 'system',
                title: 'Filtered'
            },
            [setIds[2]]: {
                id: 'selection',
                level: 'system',
                title: 'Selected'
            }
        }
    };
}

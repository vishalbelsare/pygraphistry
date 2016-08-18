import { simpleflake } from 'simpleflakes';
import { ref as $ref, atom as $atom } from 'reaxtor-falcor-json-graph';

export function sets(workbookId, viewId, setIds = [ simpleflake().toJSON(),
                                                    simpleflake().toJSON(),
                                                    simpleflake().toJSON() ]) {
    const route = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        sets: {
            open: false,
            name: 'Sets',
            length: 3,
            0: $ref(`${route}.setsById['${setIds[0]}']`),
            1: $ref(`${route}.setsById['${setIds[1]}']`),
            2: $ref(`${route}.setsById['${setIds[2]}']`)
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

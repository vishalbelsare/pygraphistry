import { simpleflake } from 'simpleflakes';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

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
                selected: false,
                view: $ref(`${view}`),
                id: 'toggle-sets',
                name: 'Sets',
                type: 'toggle',
                value: 0,
                values: $atom([[
                    $value(`${view}.panels.left`, $atom(undefined))
                ], [
                    $value(`${view}.panels.left`, $ref(`${view}.sets`)),
                    $value(`${view}.scene.controls[1].value`, $atom(0)),
                    $value(`${view}.labels.controls[0].value`, $atom(0)),
                    $value(`${view}.layout.controls[0].value`, $atom(0)),
                    $value(`${view}.filters.controls[0].value`, $atom(0)),
                    $value(`${view}.exclusions.controls[0].value`, $atom(0)),
                ]])
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

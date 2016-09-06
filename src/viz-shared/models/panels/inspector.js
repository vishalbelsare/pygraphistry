import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

export function inspector(workbookId, viewId) {
    const view = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        inspector: {
            open: false,
            length: 0,
            id: 'inspector',
            name: 'Data inspector',
            scene: $ref(`${view}.scene`),
            // edges: $ref(`${view}.scene.selection.edges`),
            // points: $ref(`${view}.scene.selection.points`),
            controls: [{
                id: 'toggle-inspector',
                name: 'Inspector',
                type: 'toggle',
                value: 0,
                values: $atom([[
                    $value(`${view}.panels.bottom`, $atom(undefined))
                ], [
                    $value(`${view}.panels.bottom`, $ref(`${view}.inspector`)),
                    $value(`${view}.timebar.controls[0].value`, $atom(0)),
                ]])
            }]
        }
    }
}

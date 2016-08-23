import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';

export function inspector(workbookId, viewId) {
    const view = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        inspector: {
            open: false,
            length: 0,
            id: 'inspector',
            name: 'Data inspector',
            scene: $ref(`${view}.scene`),
            // values: $ref(`${view}.scene.selection.edges`),
            // values: $ref(`${view}.scene.selection.points`),
            controls: [{
                id: 'toggle-inspector',
                name: 'Inspector',
                type: 'toggle',
                stateKey: 'bottom',
                state: $ref(`${view}.panels`),
                value: $atom(undefined),
                values: $atom([$ref(`${view}.inspector`), $atom(undefined)])
            }]
        }
    }
}

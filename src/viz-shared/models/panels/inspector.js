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
            edges: $ref(`${view}.scene.selection.edges`),
            points: $ref(`${view}.scene.selection.points`),
            controls: [{
                selected: false,
                view: $ref(`${view}`),
                id: 'toggle-inspector',
                name: 'Inspector',
            }]
        }
    }
}

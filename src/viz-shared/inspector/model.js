import { ref as $ref, atom as $atom } from 'reaxtor-falcor-json-graph';

export function inspector(workbookId, viewId) {
    const route = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        inspector: {
            open: false,
            name: 'Data inspector',
            selection: $atom('selection'),
            scene: $ref(`${route}.scene`)
        }
    }
}

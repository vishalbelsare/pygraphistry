import { ref as $ref, atom as $atom } from 'reaxtor-falcor-json-graph';

export function histograms(workbookId, viewId) {
    const route = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        histogramsById: {},
        histograms: {
            length: 0,
            open: false,
            name: 'Histograms',
            selection: $atom('selection'),
            scene: $ref(`${route}.scene`)
        }
    };
}

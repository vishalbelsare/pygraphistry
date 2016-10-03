import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

export function histograms(workbookId, viewId) {
    const view = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        histograms: {
            length: 0,
            id: 'histograms',
            name: 'Histograms',
            scene: $ref(`${view}.scene`),
            templates: $ref(`${view}.expressions`),
            controls: [{
                selected: false,
                view: $ref(`${view}`),
                id: 'toggle-histograms',
                name: 'Histograms',
            }]
        }
    };
}

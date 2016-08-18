import Color from 'color';
import { ref as $ref, atom as $atom } from 'reaxtor-falcor-json-graph';

export function labels(workbookId, viewId) {
    const route = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        labels: {
            opacity: 1, enabled: true,
            selection: $atom(undefined),
            timeZone: '', poiEnabled: true,
            foreground: { color: new Color('#1f1f33') },
            background: { color: new Color('#ffffff').alpha(0.9) },
            scene: $ref(`${route}.scene`),
        }
    };
}

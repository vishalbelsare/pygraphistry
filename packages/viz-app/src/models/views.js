import { scene } from './scene';
import { axis } from './axis';
import { camera } from './camera';
import { legend } from './legend';
import { toolbar } from './toolbar';
import { labels } from './labels';
import { layout } from './layout';
import { encodings } from './encodings';
import { inspector } from './inspector';
import { selection } from './selection';
import { expressions } from './expressions';
import { simpleflake } from 'simpleflakes';
import { ref as $ref, atom as $atom, pathValue as $value } from '@graphistry/falcor-json-graph';

export function views(workbookId, viewId = simpleflake().toJSON()) {
    const view = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        views: {
            length: 1,
            current: $ref(`${view}`, { $expires: 1 }),
            0: $ref(`${view}`, { $expires: 1 })
        },
        viewsById: {}
    };
}

export function view(workbookId, sceneID = 'default', viewId = simpleflake().toJSON()) {
    const view = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        id: viewId,
        title: '',
        columns: [],
        absolutePath: view,
        pruneOrphans: false,
        panels: {
            // left: undefined,
            // right: undefined,
            // bottom: undefined
        },
        ...camera(view),
        ...scene(view, sceneID),
        ...labels(view),
        ...axis(view),
        ...layout(view),
        ...legend(view),
        ...encodings(view),
        ...inspector(view),
        ...selection(view),
        ...expressions(view),
        ...toolbar(workbookId, viewId)
    };
}

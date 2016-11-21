import { scene } from './scene';
import { camera } from './camera';
import { legend } from './legend';
import { toolbar } from './toolbar';
import { labels } from './labels';
import { layout } from './layout';
import { inspector } from './panels';
import { selection } from './selection';
import { expressions } from './expressions';
import { simpleflake } from 'simpleflakes';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

export function views(workbookId, viewId = simpleflake().toJSON()) {
    const view = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        views: {
            length: 1,
            current: $ref(`${view}`),
            0:       $ref(`${view}`),
        },
        viewsById: {}
    };
}

export function view(workbookId, sceneID = 'default', viewId = simpleflake().toJSON()) {
    const view = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        id: viewId,
        absolutePath: view,
        pruneOrphans: false,
        title: '', columns: [],
        panels: {
            left: undefined,
            right: undefined,
            bottom: undefined
        },
        ...camera(view),
        ...scene(view, sceneID),
        ...labels(view),
        ...layout(view),
        ...legend(view),
        // ...timebar(view),
        ...toolbar(workbookId, viewId),
        ...inspector(view),
        ...selection(view),
        ...expressions(view)
    };
}

import { scene } from './scene';
import { legend } from './legend';
import { toolbar } from './toolbar';
import { timebar, inspector } from './panels';
import { expressions } from './expressions';

import { simpleflake } from 'simpleflakes';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';

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

export function view(workbookId, rendererScene, options, viewId = simpleflake().toJSON()) {
    return {
        id: viewId, title: '',
        panels: {
            left: undefined,
            right: undefined,
            bottom: undefined
        },
        ...expressions(workbookId, viewId),
        ...legend(workbookId, viewId),
        ...timebar(workbookId, viewId),
        ...toolbar(workbookId, viewId),
        ...inspector(workbookId, viewId),
        ...scene(workbookId, viewId, rendererScene, options),
    };
}

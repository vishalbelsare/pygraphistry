import Color from 'color';
import { scene } from './scene';
import { legend } from './legend';
import { toolbar } from './toolbar';

import {
    sets,
    timebar,
    filters,
    inspector,
    exclusions,
    histograms
} from './panels';

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
        foreground: { color: new Color('#ffffff') },
        background: { color: getBackgroundColor(rendererScene, options) },
        panels: { left: undefined, right: undefined, bottom: undefined },
        ...sets(workbookId, viewId),
        ...legend(workbookId, viewId),
        ...filters(workbookId, viewId),
        ...timebar(workbookId, viewId),
        ...toolbar(workbookId, viewId),
        ...inspector(workbookId, viewId),
        ...exclusions(workbookId, viewId),
        ...histograms(workbookId, viewId),
        ...scene(workbookId, viewId, rendererScene),
    };
}

function getBackgroundColor(rendererScene, requestOptions = {}) {

    const { options } = rendererScene;

    if (options) {
        let background = requestOptions.backgroundColor;
        if (typeof background !== 'undefined') {
            const { clearColor } = options;
            try {
                background = new Color(background);
                options.clearColor = [background.rgbaArray().map((x, i) =>
                    i === 3 ? x : x / 255
                )];
            } catch (e) {
                options.clearColor = clearColor;
            }
        }
    } else {
        rendererScene.options = {
            clearColor: [new Color('#333339').rgbaArray().map((x, i) =>
                i === 3 ? x : x / 255
            )]
        };
    }

    const { clearColor } = rendererScene.options;
    const backgroundRGBA = (clearColor[0] || [0, 0, 0, 1]).map((x, i) =>
        i < 3 ? x * 255 : x
    );

    return (new Color()
        .rgb(backgroundRGBA.slice(0, -1))
        .alpha(backgroundRGBA[3] || 1)
    );
}

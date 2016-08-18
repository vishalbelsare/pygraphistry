import Color from 'color';
import { scene } from '../scene/model';
import { legend } from '../legend/model';
import { sets } from '../sets/model';
import { timebar } from '../timebar/model';
import { labels } from '../labels/model';
import { toolbar } from '../toolbar/model';
import { filters } from '../filters/model';
import { settings } from '../settings/model';
import { inspector } from '../inspector/model';
import { exclusions } from '../exclusions/model';
import { histograms } from '../histograms/model';
import { simpleflake } from 'simpleflakes';
import { ref as $ref, atom as $atom } from 'reaxtor-falcor-json-graph';

export function views(workbookId, viewId = simpleflake().toJSON()) {
    const route = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        views: {
            length: 1,
            current: $ref(`${route}`),
            0:       $ref(`${route}`),
        },
        viewsById: {}
    };
}

export function view(workbookId, rendererScene, options, viewId = simpleflake().toJSON()) {
    return {
        id: viewId, title: '',
        foreground: { color: new Color('#ffffff') },
        background: { color: getBackgroundColor(rendererScene, options) },
        ...sets(workbookId, viewId),
        ...labels(workbookId, viewId),
        ...legend(workbookId, viewId),
        ...filters(workbookId, viewId),
        ...timebar(workbookId, viewId),
        ...toolbar(workbookId, viewId),
        ...settings(workbookId, viewId),
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

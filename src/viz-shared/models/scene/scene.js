import Color from 'color';
import { camera } from './camera';
import { labels } from './labels';
import { layout } from './layout';
import { selection } from './selection';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';

export function scene(workbookId, viewId, scene, options) {
    const view = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        scene: {
            id: 'scene',
            name: 'Scene',
            simulating: true,
            hints: {
                edges: $atom(undefined),
                points: $atom(undefined)
            },
            ...labels(`${view}.scene`),
            ...layout(`${view}.scene`),
            ...selection(view, `${view}.scene`),
            ...scene,
            camera: {
                ...scene.camera,
                ...camera(`${view}.scene`).camera
            },
            foreground: { color: new Color('#ffffff') },
            background: { color: getBackgroundColor(scene, options) },
            settings: [{
                    id: 'canvas',
                    name: 'Canvas',
                    length: 2, ...[{
                        id: 'foreground-color',
                        type: 'color',
                        name: 'Foreground Color',
                        stateKey: 'color',
                        state: $ref(`${view}.scene.foreground`)
                    }, {
                        id: 'background-color',
                        type: 'color',
                        name: 'Background Color',
                        stateKey: 'color',
                        state: $ref(`${view}.scene.background`)
                    }]
                },
                $ref(`${view}.scene.camera.options`)
            ],
            controls: [{
                id: 'toggle-simulating',
                name: 'Toggle visual clustering',
                type: 'toggle',
                stateKey: 'simulating',
                state: $ref(`${view}.scene`),
                value: true,
                values: $atom([true, false])
            }, {
                id: 'toggle-scene-settings',
                name: 'Scene settings',
                type: 'toggle',
                stateKey: 'left',
                state: $ref(`${view}.panels`),
                value: $atom(undefined),
                values: $atom([$ref(`${view}.scene`), $atom(undefined)])
            }, {
                id: 'toggle-label-settings',
                name: 'Label settings',
                type: 'toggle',
                stateKey: 'left',
                state: $ref(`${view}.panels`),
                value: $atom(undefined),
                values: $atom([$ref(`${view}.scene.labels`), $atom(undefined)])
            }, {
                id: 'toggle-layout-settings',
                name: 'Layout settings',
                type: 'toggle',
                stateKey: 'left',
                state: $ref(`${view}.panels`),
                value: $atom(undefined),
                values: $atom([$ref(`${view}.scene.layout`), $atom(undefined)])
            }]
        }
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

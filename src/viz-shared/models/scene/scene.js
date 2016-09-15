import Color from 'color';
import { camera } from './camera';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

export function scene(workbookId, viewId, rendererScene, options) {
    const view = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        scene: {
            id: 'scene',
            name: 'Scene',
            simulating: true,
            showArrows: true,
            pruneOrphans: false,
            ...rendererScene,
            foreground: { color: new Color('#ffffff') },
            hints: { edges: undefined, points: undefined },
            background: { color: getBackgroundColor(rendererScene, options) },
            camera: {
                ...rendererScene.camera,
                ...camera(`${view}.scene`).camera
            },
            controls: [{
                id: 'toggle-simulating',
                name: 'Toggle visual clustering',
                type: 'toggle',
                value: 1,
                values: $atom([[
                    $value(`${view}.scene.simulating`, $atom(false))
                ], [
                    $value(`${view}.scene.simulating`, $atom(true))
                ]])
            }, {
                id: 'toggle-scene-settings',
                name: 'Scene settings',
                type: 'toggle',
                value: 0,
                values: $atom([[
                    $value(`${view}.panels.left`, $atom(undefined))
                ], [
                    $value(`${view}.panels.left`, $ref(`${view}.scene`)),
                    $value(`${view}.labels.controls[0].value`, $atom(0)),
                    $value(`${view}.layout.controls[0].value`, $atom(0)),
                    $value(`${view}.sets.controls[0].value`, $atom(0)),
                    $value(`${view}.filters.controls[0].value`, $atom(0)),
                    $value(`${view}.exclusions.controls[0].value`, $atom(0)),
                ]])
            }],
            settings: [{
                id: 'canvas',
                name: 'Canvas',
                length: 2, ...[{
                    id: 'point-colors',
                    type: 'color',
                    name: 'Point Colors',
                    stateKey: 'color',
                    state: $ref(`${view}.scene.foreground`)
                }, {
                    id: 'background-color',
                    type: 'color',
                    name: 'Background Color',
                    stateKey: 'color',
                    state: $ref(`${view}.scene.background`)
                }]
            }, {
                id: 'appearance',
                name: 'Appearance',
                length: 6, ...[{
                    id: 'point-size',
                    type: 'discrete',
                    name: 'Point Size',
                    props: {
                        min: 1, max: 100,
                        step: 1, scale: 'log'
                    },
                    stateKey: 'scaling',
                    state: $ref(`${view}.scene.camera.points`)
                }, {
                    id: 'edge-size',
                    type: 'discrete',
                    name: 'Edge Size',
                    props: {
                        min: 1, max: 100,
                        step: 1, scale: 'log'
                    },
                    stateKey: 'scaling',
                    state: $ref(`${view}.scene.camera.edges`)
                }, {
                    id: 'point-opacity',
                    type: 'discrete',
                    name: 'Point Opacity',
                    props: {
                        min: 1, max: 100,
                        step: 1, scale: 'percent'
                    },
                    stateKey: 'opacity',
                    state: $ref(`${view}.scene.camera.points`)
                }, {
                    id: 'edge-opacity',
                    type: 'discrete',
                    name: 'Edge Opacity',
                    props: {
                        min: 1, max: 100,
                        step: 1, scale: 'percent'
                    },
                    stateKey: 'opacity',
                    state: $ref(`${view}.scene.camera.edges`)
                }, {
                    id: 'show-arrows',
                    type: 'bool',
                    name: 'Show Arrows',
                    stateKey: 'showArrows',
                    state: $ref(`${view}.scene`)
                }, {
                    id: 'prune-orphans',
                    type: 'bool',
                    name: 'Prune Isolated Nodes',
                    stateKey: 'pruneOrphans',
                    state: $ref(`${view}.scene`)
                }]
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

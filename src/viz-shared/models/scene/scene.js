import { camera } from './camera';
import { labels } from './labels';
import { layout } from './layout';
import { selection } from './selection';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';

export function scene(workbookId, viewId, scene) {
    const view = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        scene: {
            id: 'scene',
            name: 'Scene',
            simulating: false,
            hints: {
                edges: $atom(undefined, { $expires: 1 }),
                points: $atom(undefined, { $expires: 1})
            },
            ...labels(`${view}.scene`),
            ...layout(`${view}.scene`),
            ...selection(view, `${view}.scene`),
            ...scene,
            camera: { ...scene.camera, ...camera(`${view}.scene`).camera },
            settings: [
                $ref(`${view}.scene.options`),
                $ref(`${view}.scene.camera.options`)
            ],
            controls: [{
                id: 'toggle-simulating',
                name: 'Toggle visual clustering',
                type: 'toggle',
                stateKey: 'simulating',
                state: $ref(`${view}.scene`),
                value: false,
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
            }],
            options: {
                id: 'canvas',
                name: 'Canvas',
                length: 2, ...[{
                    id: 'foreground-color',
                    type: 'color',
                    name: 'Foreground Color',
                    stateKey: 'color',
                    state: $ref(`${view}.foreground`)
                }, {
                    id: 'background-color',
                    type: 'color',
                    name: 'Background Color',
                    stateKey: 'color',
                    state: $ref(`${view}.background`)
                }]
            }
        }
    };
}


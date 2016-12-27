import Color from 'color';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

export function scene(view, sceneID = 'default') {
    return {
        scene: {
            id: sceneID,
            name: 'Scene',
            simulating: false,

            camera: $ref(`${view}.camera`),
            labels: $ref(`${view}.labels`),
            release: $ref(`release.current`),
            highlight: $ref(`${view}.highlight`),
            selection: $ref(`${view}.selection`),

            renderer: {
                id: sceneID,
                showArrows: true,
                camera: $ref(`${view}.camera`),
                highlight: $ref(`${view}.highlight`),
                selection: $ref(`${view}.selection`),
                foreground: { color: new Color(`#ffffff`) },
                background: { color: new Color(`#333339`) },
                edges: { scaling: 1, opacity: 1, elements: undefined },
                points: { scaling: 1, opacity: 1, elements: undefined },
            },

            controls: [{
                selected: false,
                id: 'toggle-simulating',
                name: 'Toggle visual clustering',
            }, {
                selected: false,
                id: 'toggle-scene-settings',
                name: 'Scene settings',
            }],
            settings: [{
                id: 'canvas',
                name: 'Canvas',
                length: 2, ...[{
                    id: 'point-colors',
                    type: 'color',
                    name: 'Point Colors',
                    value: $ref(`${view}.scene.renderer.foreground.color`),
                }, {
                    id: 'background-color',
                    type: 'color',
                    name: 'Background Color',
                    value: $ref(`${view}.scene.renderer.background.color`),
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
                    value: $ref(`${view}.scene.renderer.points.scaling`),
                }, {
                    id: 'edge-size',
                    type: 'discrete',
                    name: 'Edge Size',
                    props: {
                        min: 1, max: 100,
                        step: 1, scale: 'log'
                    },
                    value: $ref(`${view}.scene.renderer.edges.scaling`),
                }, {
                    id: 'point-opacity',
                    type: 'discrete',
                    name: 'Point Opacity',
                    props: {
                        min: 0, max: 100,
                        step: 1, scale: 'percent'
                    },
                    value: $ref(`${view}.scene.renderer.points.opacity`),
                }, {
                    id: 'edge-opacity',
                    type: 'discrete',
                    name: 'Edge Opacity',
                    props: {
                        min: 0, max: 100,
                        step: 1, scale: 'percent'
                    },
                    value: $ref(`${view}.scene.renderer.edges.opacity`),
                }, {
                    id: 'show-arrows',
                    type: 'bool',
                    name: 'Show Arrows',
                    value: $ref(`${view}.scene.renderer.showArrows`),
                }, {
                    id: 'prune-orphans',
                    type: 'bool',
                    name: 'Prune Isolated Nodes',
                    value: $ref(`${view}.pruneOrphans`),
                }]
            }]
        }
    };
}

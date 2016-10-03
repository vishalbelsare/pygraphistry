import Color from 'color';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

export function scene(workbookId, viewId, sceneID = 'default') {
    const view = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        scene: {
            id: sceneID,
            name: 'Scene',
            simulating: true,
            showArrows: true,
            pruneOrphans: false,
            camera: $ref(`${view}.camera`),
            highlight: $ref(`${view}.highlight`),
            selection: $ref(`${view}.selection`),
            foreground: { color: new Color(`#ffffff`) },
            background: { color: new Color(`#333339`) },
            edges: { scaling: 1, opacity: 1, elements: undefined },
            points: { scaling: 1, opacity: 1, elements: undefined },
            controls: [{
                selected: true,
                view: $ref(`${view}`),
                id: 'toggle-simulating',
                name: 'Toggle visual clustering',
            }, {
                selected: false,
                view: $ref(`${view}`),
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
                    value: $ref(`${view}.scene.foreground.color`),
                    // stateKey: 'color',
                    // state: $ref(`${view}.scene.foreground`)
                }, {
                    id: 'background-color',
                    type: 'color',
                    name: 'Background Color',
                    value: $ref(`${view}.scene.background.color`),
                    // stateKey: 'color',
                    // state: $ref(`${view}.scene.background`)
                }]
            }, {
                id: 'appearance',
                name: 'Appearance',
                length: 5, ...[{
                    id: 'point-size',
                    type: 'discrete',
                    name: 'Point Size',
                    props: {
                        min: 1, max: 100,
                        step: 1, scale: 'log'
                    },
                    value: $ref(`${view}.scene.points.scaling`),
                    // stateKey: 'scaling',
                    // state: $ref(`${view}.scene.points`)
                // }, {
                //     id: 'edge-size',
                //     type: 'discrete',
                //     name: 'Edge Size',
                //     props: {
                //         min: 1, max: 100,
                //         step: 1, scale: 'log'
                //     },
                //     stateKey: 'scaling',
                //     state: $ref(`${view}.scene.edges`)
                }, {
                    id: 'point-opacity',
                    type: 'discrete',
                    name: 'Point Opacity',
                    props: {
                        min: 0, max: 100,
                        step: 1, scale: 'percent'
                    },
                    value: $ref(`${view}.scene.points.opacity`),
                    // stateKey: 'opacity',
                    // state: $ref(`${view}.scene.points`)
                }, {
                    id: 'edge-opacity',
                    type: 'discrete',
                    name: 'Edge Opacity',
                    props: {
                        min: 0, max: 100,
                        step: 1, scale: 'percent'
                    },
                    value: $ref(`${view}.scene.edges.opacity`),
                    // stateKey: 'opacity',
                    // state: $ref(`${view}.scene.edges`)
                }, {
                    id: 'show-arrows',
                    type: 'bool',
                    name: 'Show Arrows',
                    value: $ref(`${view}.scene.showArrows`),
                    // stateKey: 'showArrows',
                    // state: $ref(`${view}.scene`)
                }, {
                    id: 'prune-orphans',
                    type: 'bool',
                    name: 'Prune Isolated Nodes',
                    value: $ref(`${view}.scene.pruneOrphans`),
                    // stateKey: 'pruneOrphans',
                    // state: $ref(`${view}.scene`)
                }]
            }]
        }
    };
}

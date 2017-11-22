import Color from 'color';
import { ref as $ref, atom as $atom, pathValue as $value } from '@graphistry/falcor-json-graph';

export function scene(view, sceneID = 'default') {
    return {
        scene: {
            id: sceneID,
            name: 'Scene',
            simulating: false,

            camera: $ref(`${view}.camera`),
            labels: $ref(`${view}.labels`),
            axis: $ref(`${view}.axis`),
            legend: $ref(`${view}.legend`),
            release: $ref(`release.current`),
            highlight: $ref(`${view}.highlight`),
            selection: $ref(`${view}.selection`),
            legendTypeHisto: $ref(`${view}.histogramsById.legendTypeHistogram`),
            legendPivotHisto: $ref(`${view}.histogramsById.legendPivotHistogram`),
            timebarHisto: $ref(`${view}.histogramsById.timebarHistogram`),

            renderer: {
                id: sceneID,
                showArrows: true,
                camera: $ref(`${view}.camera`),
                highlight: $ref(`${view}.highlight`),
                selection: $ref(`${view}.selection`),
                foreground: { color: new Color(`#ffffff`) },
                background: { color: new Color(`#333339`) },
                edges: { scaling: 1, opacity: 1, elements: undefined },
                points: { scaling: 1, opacity: 1, elements: undefined }
            },

            controls: [
                {
                    selected: false,
                    id: 'toggle-simulating',
                    name: 'Toggle visual clustering'
                },
                {
                    selected: false,
                    id: 'toggle-scene-settings',
                    name: 'Scene settings',
                    type: 'settings'
                }
            ],
            settings: [
                {
                    id: 'scene',
                    length: 8,
                    ...[
                        $ref(`${view}.scene.options['background-color']`),
                        $ref(`${view}.scene.options['point-colors']`),
                        $ref(`${view}.scene.options['show-arrows']`),
                        $ref(`${view}.scene.options['prune-orphans']`),
                        $ref(`${view}.scene.options['point-size']`),
                        $ref(`${view}.scene.options['edge-size']`),
                        $ref(`${view}.scene.options['point-opacity']`),
                        $ref(`${view}.scene.options['edge-opacity']`)
                    ]
                }
            ],
            options: {
                'point-colors': {
                    id: 'point-colors',
                    type: 'color',
                    name: 'Override Point Colors',
                    value: $ref(`${view}.scene.renderer.foreground.color`)
                },
                'background-color': {
                    id: 'background-color',
                    type: 'color',
                    name: 'Background Color',
                    value: $ref(`${view}.scene.renderer.background.color`)
                },
                'show-arrows': {
                    id: 'show-arrows',
                    type: 'bool',
                    name: 'Show Arrows',
                    value: $ref(`${view}.scene.renderer.showArrows`)
                },
                'prune-orphans': {
                    id: 'prune-orphans',
                    type: 'bool',
                    name: 'Prune Isolated Nodes',
                    value: $ref(`${view}.pruneOrphans`)
                },
                'point-size': {
                    id: 'point-size',
                    type: 'discrete',
                    name: 'Point Size',
                    props: {
                        min: 1,
                        max: 100,
                        step: 1,
                        scale: 'log'
                    },
                    value: $ref(`${view}.scene.renderer.points.scaling`)
                },
                'edge-size': {
                    id: 'edge-size',
                    type: 'discrete',
                    name: 'Edge Size',
                    props: {
                        min: 1,
                        max: 100,
                        step: 1,
                        scale: 'log'
                    },
                    value: $ref(`${view}.scene.renderer.edges.scaling`)
                },
                'point-opacity': {
                    id: 'point-opacity',
                    type: 'discrete',
                    name: 'Point Opacity',
                    props: {
                        min: 0,
                        max: 100,
                        step: 1,
                        scale: 'percent'
                    },
                    value: $ref(`${view}.scene.renderer.points.opacity`)
                },
                'edge-opacity': {
                    id: 'edge-opacity',
                    type: 'discrete',
                    name: 'Edge Opacity',
                    props: {
                        min: 0,
                        max: 100,
                        step: 1,
                        scale: 'percent'
                    },
                    value: $ref(`${view}.scene.renderer.edges.opacity`)
                }
            }
        }
    };
}

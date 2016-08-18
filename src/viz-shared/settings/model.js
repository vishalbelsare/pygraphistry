import { ref as $ref, atom as $atom } from 'reaxtor-falcor-json-graph';

export function settings(workbookId, viewId) {
    const route = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        settings: {
            open: false,
            name: 'Settings',
            length: 3,
            0: $ref(`${route}.settingsById['canvas']`),
            1: $ref(`${route}.settingsById['appearance']`),
            2: $ref(`${route}.settingsById['labels']`)
        },
        settingsById: {
            canvas: {
                id: 'canvas',
                name: 'Canvas',
                length: 2,
                0: {
                    id: 'foreground-color',
                    type: 'color',
                    name: 'Foreground',
                    value: $ref(`${route}.foreground.color`)
                },
                1: {
                    id: 'background-color',
                    type: 'color',
                    name: 'Background',
                    value: $ref(`${route}.background.color`)
                }
            },
            appearance: {
                id: 'appearance',
                name: 'Appearance',
                length: 4,
                0: {
                    id: 'point-scaling',
                    type: 'discrete',
                    name: 'Point Size',
                    props: {
                        min: 1, max: 100,
                        step: 1, scale: 'log'
                    },
                    value: $ref(`${route}.scene.camera.points.scaling`)
                },
                1: {
                    id: 'edge-scaling',
                    type: 'discrete',
                    name: 'Edge Size',
                    props: {
                        min: 1, max: 100,
                        step: 1, scale: 'log'
                    },
                    value: $ref(`${route}.scene.camera.edges.scaling`)
                },
                2: {
                    id: 'point-opacity',
                    type: 'discrete',
                    name: 'Point Opacity',
                    props: {
                        min: 1, max: 100,
                        step: 1, scale: 'percent'
                    },
                    value: $ref(`${route}.scene.camera.points.opacity`)
                },
                3: {
                    id: 'edge-opacity',
                    type: 'discrete',
                    name: 'Edge Opacity',
                    props: {
                        min: 1, max: 100,
                        step: 1, scale: 'percent'
                    },
                    value: $ref(`${route}.scene.camera.edges.opacity`)
                },
                // 4: {
                //     id: 'prune-orphans',
                //     type: 'bool',
                //     name: 'Prune Orphans',
                //     value: $ref(`${route}.pruneOrphans`)
                // }
            },
            labels: {
                id: 'labels',
                name: 'Labels',
                length: 5,
                0: {
                    id: 'foreground-color',
                    type: 'color',
                    name: 'Text Color',
                    value: $ref(`${route}.labels.foreground.color`)
                },
                1: {
                    id: 'background-color',
                    type: 'color',
                    name: 'Background Color',
                    value: $ref(`${route}.labels.background.color`)
                },
                2: {
                    id: 'labels-opacity',
                    type: 'discrete',
                    name: 'Transparency',
                    props: {
                        min: 0, max: 100,
                        step: 1, scale: 'percent'
                    },
                    value: $ref(`${route}.labels.opacity`)
                },
                3: {
                    id: 'labels-enabled',
                    type: 'bool',
                    name: 'Show Labels',
                    value: $ref(`${route}.labels.enabled`)
                },
                4: {
                    id: 'poi-enabled',
                    type: 'bool',
                    name: 'Show Points of Interest',
                    value: $ref(`${route}.labels.poiEnabled`)
                }
            }
        }
    };
}

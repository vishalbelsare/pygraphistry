import Color from 'color';
import { simpleflake } from 'simpleflakes';
import { ref as $ref, atom as $atom } from 'falcor-json-graph';

export function view(workbookId, scene, options, viewId = simpleflake().toJSON()) {

    const filterId = simpleflake().toJSON();
    const setIds = [ simpleflake().toJSON(),
                     simpleflake().toJSON(),
                     simpleflake().toJSON() ];

    return {
        id: viewId,
        scene: {
            hints: {
                edges: $atom(undefined, { $expires: 1 }),
                points: $atom(undefined, { $expires: 1})
            },
            ...scene, camera: { ...scene.camera, ...{
                    edges: { scaling: 1, opacity: 1 },
                    points: { scaling: 1, opacity: 1 }
                }
            }
        },
        title: '', pruneOrphans: false,
        background: { color: getBackgroundColor(scene, options) },
        foreground: { color: new Color('#ffffff') },
        labels: {
            opacity: 1, enabled: true,
            timeZone: '', poiEnabled: true,
            foreground: { color: new Color('#1f1f33') },
            background: { color: new Color('#ffffff').alpha(0.9) }
        },
        legend: {
            title: '', subtitle: '',
            nodes: 0, edges: 0, open: false
        },
        panels: {
            length: 3,
            0: $ref(`workbooksById['${workbookId}']
                    .viewsById['${viewId}'].sets`),
            1: $ref(`workbooksById['${workbookId}']
                    .viewsById['${viewId}'].filters`),
            2: $ref(`workbooksById['${workbookId}']
                    .viewsById['${viewId}'].settings`)
        },
        sets: {
            length: 3, name: 'Sets', open: false,
            0: $ref(`workbooksById['${workbookId}']
                    .viewsById['${viewId}']
                    .setsById['${setIds[0]}']`),
            1: $ref(`workbooksById['${workbookId}']
                    .viewsById['${viewId}']
                    .setsById['${setIds[1]}']`),
            2: $ref(`workbooksById['${workbookId}']
                    .viewsById['${viewId}']
                    .setsById['${setIds[2]}']`)
        },
        filters: {
            length: 1, name: 'Filters', open: false,
            0: $ref(`workbooksById['${workbookId}']
                    .viewsById['${viewId}']
                    .filtersById['${filterId}']`)
        },
        settings: {
            length: 3, name: 'Settings', open: false,
            0: $ref(`workbooksById['${workbookId}']
                        .viewsById['${viewId}']
                        .settingsById['canvas']`),
            1: $ref(`workbooksById['${workbookId}']
                        .viewsById['${viewId}']
                        .settingsById['appearance']`),
            2: $ref(`workbooksById['${workbookId}']
                        .viewsById['${viewId}']
                        .settingsById['labels']`)
        },
        labelsById: {},
        setsById: {
            [setIds[0]]: {
                id: 'dataframe',
                level: 'system',
                title: 'Loaded'
            },
            [setIds[1]]: {
                id: 'filtered',
                level: 'system',
                title: 'Filtered'
            },
            [setIds[2]]: {
                id: 'selection',
                level: 'system',
                title: 'Selected'
            }
        },
        filtersById: {
            [filterId]: {
                id: filterId,
                title: 'Point Limit',
                attribute: undefined,
                level: 'system',
                query: {
                    type: 'point',
                    ast: {
                        type: 'Limit',
                        value: {
                            type: 'Literal',
                            dataType: 'integer',
                            value: 8e5
                        }
                    },
                    inputString: 'LIMIT 800000'
                }
            }
        },
        settingsById: {
            canvas: {
                id: 'canvas',
                name: 'Canvas',
                controls: [
                    $ref(`workbooksById['${workbookId}']
                                .viewsById['${viewId}']
                                .settingsById['canvas']
                                .controlsById['foreground-color']`),
                    $ref(`workbooksById['${workbookId}']
                                .viewsById['${viewId}']
                                .settingsById['canvas']
                                .controlsById['background-color']`)
                ],
                controlsById: {
                    'foreground-color': {
                        id: 'foreground-color',
                        type: 'color',
                        name: 'Foreground',
                        value: $ref(`workbooksById['${workbookId}']
                                        .viewsById['${viewId}']
                                        .foreground.color`)
                    },
                    'background-color': {
                        id: 'background-color',
                        type: 'color',
                        name: 'Background',
                        value: $ref(`workbooksById['${workbookId}']
                                        .viewsById['${viewId}']
                                        .background.color`)
                    }
                }
            },
            appearance: {
                id: 'appearance',
                name: 'Appearance',
                controls: [
                    $ref(`workbooksById['${workbookId}']
                                .viewsById['${viewId}']
                                .settingsById['appearance']
                                .controlsById['point-scaling']`),
                    $ref(`workbooksById['${workbookId}']
                                .viewsById['${viewId}']
                                .settingsById['appearance']
                                .controlsById['edge-scaling']`),
                    $ref(`workbooksById['${workbookId}']
                                .viewsById['${viewId}']
                                .settingsById['appearance']
                                .controlsById['point-opacity']`),
                    $ref(`workbooksById['${workbookId}']
                                .viewsById['${viewId}']
                                .settingsById['appearance']
                                .controlsById['edge-opacity']`),
                    // $ref(`workbooksById['${workbookId}']
                    //             .viewsById['${viewId}']
                    //             .settingsById['appearance']
                    //             .controlsById['prune-orphans']`)
                ],
                controlsById: {
                    'point-scaling': {
                        id: 'point-scaling',
                        type: 'discrete',
                        name: 'Point Size',
                        props: {
                            min: 1, max: 100,
                            step: 1, scale: 'log'
                        },
                        value: $ref(`workbooksById['${workbookId}']
                                        .viewsById['${viewId}']
                                        .scene.camera.points.scaling`)
                    },
                    'edge-scaling': {
                        id: 'edge-scaling',
                        type: 'discrete',
                        name: 'Edge Size',
                        props: {
                            min: 1, max: 100,
                            step: 1, scale: 'log'
                        },
                        value: $ref(`workbooksById['${workbookId}']
                                        .viewsById['${viewId}']
                                        .scene.camera.edges.scaling`)
                    },
                    'point-opacity': {
                        id: 'point-opacity',
                        type: 'discrete',
                        name: 'Point Opacity',
                        props: {
                            min: 1, max: 100,
                            step: 1, scale: 'percent'
                        },
                        value: $ref(`workbooksById['${workbookId}']
                                        .viewsById['${viewId}']
                                        .scene.camera.points.opacity`)
                    },
                    'edge-opacity': {
                        id: 'edge-opacity',
                        type: 'discrete',
                        name: 'Edge Opacity',
                        props: {
                            min: 1, max: 100,
                            step: 1, scale: 'percent'
                        },
                        value: $ref(`workbooksById['${workbookId}']
                                        .viewsById['${viewId}']
                                        .scene.camera.edges.opacity`)
                    },
                    'prune-orphans': {
                        id: 'prune-orphans',
                        type: 'bool',
                        name: 'Prune Orphans',
                        value: $ref(`workbooksById['${workbookId}']
                                        .viewsById['${viewId}']
                                        .pruneOrphans`)
                    }
                }
            },
            labels: {
                id: 'labels',
                name: 'Labels',
                controls: [
                    $ref(`workbooksById['${workbookId}']
                                .viewsById['${viewId}']
                                .settingsById['labels']
                                .controlsById['foreground-color']`),
                    $ref(`workbooksById['${workbookId}']
                                .viewsById['${viewId}']
                                .settingsById['labels']
                                .controlsById['background-color']`),
                    $ref(`workbooksById['${workbookId}']
                                .viewsById['${viewId}']
                                .settingsById['labels']
                                .controlsById['labels-opacity']`),
                    $ref(`workbooksById['${workbookId}']
                                .viewsById['${viewId}']
                                .settingsById['labels']
                                .controlsById['labels-enabled']`),
                    $ref(`workbooksById['${workbookId}']
                                .viewsById['${viewId}']
                                .settingsById['labels']
                                .controlsById['poi-enabled']`)
                ],
                controlsById: {
                    'foreground-color': {
                        id: 'foreground-color',
                        type: 'color',
                        name: 'Text Color',
                        value: $ref(`workbooksById['${workbookId}']
                                        .viewsById['${viewId}']
                                        .labels.foreground.color`)
                    },
                    'background-color': {
                        id: 'background-color',
                        type: 'color',
                        name: 'Background Color',
                        value: $ref(`workbooksById['${workbookId}']
                                        .viewsById['${viewId}']
                                        .labels.background.color`)
                    },
                    'labels-opacity': {
                        id: 'labels-opacity',
                        type: 'discrete',
                        name: 'Transparency',
                        props: {
                            min: 0, max: 100,
                            step: 1, scale: 'percent'
                        },
                        value: $ref(`workbooksById['${workbookId}']
                                        .viewsById['${viewId}']
                                        .labels.opacity`)
                    },
                    'labels-enabled': {
                        id: 'labels-enabled',
                        type: 'bool',
                        name: 'Show Labels',
                        value: $ref(`workbooksById['${workbookId}']
                                        .viewsById['${viewId}']
                                        .labels.enabled`)
                    },
                    'poi-enabled': {
                        id: 'poi-enabled',
                        type: 'bool',
                        name: 'Show Points of Interest',
                        value: $ref(`workbooksById['${workbookId}']
                                        .viewsById['${viewId}']
                                        .labels.poiEnabled`)
                    }
                }
            }
        }
    };
}

function getBackgroundColor(scene, requestOptions = {}) {

    const { options } = scene;

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
        scene.options = {
            clearColor: [new Color('#333339').rgbaArray().map((x, i) =>
                i === 3 ? x : x / 255
            )]
        };
    }

    const { clearColor } = scene.options;
    const backgroundRGBA = (clearColor[0] || [0, 0, 0, 1]).map((x, i) =>
        i < 3 ? x * 255 : x
    );

    return (new Color()
        .rgb(backgroundRGBA.slice(0, -1))
        .alpha(backgroundRGBA[3] || 1)
    );
}

import { ref as $ref, atom as $atom } from '@graphistry/falcor-json-graph';

export function toolbar(workbookId, viewId) {
    const workbook = `workbooksById['${workbookId}']`;
    const view = `${workbook}.viewsById['${viewId}']`;
    return {
        toolbars: {
            static: {
                id: 'static',
                visible: true,
                length: 2, ...[[
                        $ref(`${view}.camera.controls[0]`),
                        $ref(`${view}.camera.controls[1]`),
                        $ref(`${view}.camera.controls[2]`),
                    ], [
                        $ref(`${view}.scene.controls[1]`),
                        $ref(`${view}.labels.controls[0]`),
                    ]
                ]
            },
            stable: {
                id: 'stable',
                visible: true,
                length: 6,
                0: {
                    name: 'Camera',
                    items: {
                        length: 3,
                        0: $ref(`${view}.camera.controls[0]`),
                        1: $ref(`${view}.camera.controls[1]`),
                        2: $ref(`${view}.camera.controls[2]`),
                    }
                },
                1: {
                    name: 'Workbook',
                    items: {
                        length: 2,
                        0: $ref(`${workbook}.controls[0]`),
                        1: $ref(`${workbook}.controls[1]`),
                    }
                },
                2: {
                    name: 'Graph',
                    items: {
                        length: 4,
                        0: $ref(`${view}.scene.controls[0]`),
                        1: $ref(`${view}.scene.controls[1]`),
                        2: $ref(`${view}.labels.controls[0]`),
                        3: $ref(`${view}.layout.controls[0]`)
                    }
                },
                3: {
                    name: 'Interact',
                    items: {
                        length: 2,
                        0: $ref(`${view}.selection.controls[0]`),
                        1: $ref(`${view}.selection.controls[1]`)
                    }
                },
                4: {
                    name: 'Inspect',
                    items: {
                        length: 4,
                        0: $ref(`${view}.histograms.controls[0]`),
                        1: $ref(`${view}.inspector.controls[0]`),
                        2: $ref(`${view}.filters.controls[0]`),
                        3: $ref(`${view}.exclusions.controls[0]`)
                    }
                },
                5: {
                    name: 'Persist',
                    items: {
                        length: 1,
                        0: $ref(`${workbook}.controls[3]`),
                    }
                }
            },
            horizontal: {
                id: 'horizontal',
                visible: true,
                length: 4,
                0: {
                    name: 'Graph',
                    items: {
                        length: 4,
                        0: $ref(`${view}.scene.controls[0]`),
                        1: $ref(`${view}.scene.controls[1]`),
                        2: $ref(`${view}.labels.controls[0]`),
                        3: $ref(`${view}.layout.controls[0]`)
                    }
                },
                1: {
                    name: 'Interact',
                    items: {
                        length: 2,
                        0: $ref(`${view}.selection.controls[0]`),
                        1: $ref(`${view}.selection.controls[1]`)
                    }
                },
                2: {
                    name: 'Query',
                    items: {
                        length: 2,
                        0: $ref(`${view}.filters.controls[0]`),
                        1: $ref(`${view}.exclusions.controls[0]`)
                    }
                },
                3: {
                    name: 'Inspect',
                    items: {
                        length: 2,
                        0: $ref(`${view}.histograms.controls[0]`),
                        1: $ref(`${view}.inspector.controls[0]`)
                    }
                }
            },
            beta: {
                id: 'beta',
                visible: true,
                length: 5, ...[[
                        $ref(`${view}.camera.controls[0]`),
                        $ref(`${view}.camera.controls[1]`),
                        $ref(`${view}.camera.controls[2]`),
                    ], [
                        $ref(`${view}.scene.controls[0]`),
                        $ref(`${view}.scene.controls[1]`),
                        $ref(`${view}.labels.controls[0]`),
                        $ref(`${view}.layout.controls[0]`),
                    ], [
                        $ref(`${view}.selection.controls[0]`),
                        $ref(`${view}.selection.controls[1]`)
                    ], [
                        $ref(`${view}.histograms.controls[0]`),
                        $ref(`${view}.inspector.controls[0]`),
                        // $ref(`${view}.timebar.controls[0]`),
                        $ref(`${view}.exclusions.controls[0]`),
                        $ref(`${view}.filters.controls[0]`),
                    ], [
                        $ref(`${workbook}.controls[0]`),
                        $ref(`${workbook}.controls[1]`),
                        $ref(`${workbook}.controls[2]`),
                        $ref(`${workbook}.controls[3]`),
                        $ref(`${workbook}.controls[4]`),
                    ]
                ]
            },
            iFrame: {
                id: 'iFrame',
                visible: true,
                length: 1, ...[[
                    $ref(`${workbook}.controls[0]`),
                    $ref(`${workbook}.controls[1]`),
                ]]
            },
        },
    };
}

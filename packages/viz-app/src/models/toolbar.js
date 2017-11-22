import { ref as $ref, atom as $atom } from '@graphistry/falcor-json-graph';

export function toolbar(workbookId, viewId) {
    const workbook = `workbooksById['${workbookId}']`;
    const view = `${workbook}.viewsById['${viewId}']`;
    return {
        toolbars: {
            stable: {
                id: 'stable',
                visible: true,
                length: 6,
                0: {
                    id: 'camera',
                    name: 'Camera',
                    items: {
                        length: 3,
                        0: $ref(`${view}.camera.controls[0]`),
                        1: $ref(`${view}.camera.controls[1]`),
                        2: $ref(`${view}.camera.controls[2]`)
                    }
                },
                1: {
                    id: 'graph',
                    name: 'Graph',
                    items: {
                        length: 4,
                        0: $ref(`${view}.scene.controls[0]`),
                        1: $ref(`${view}.scene.controls[1]`),
                        2: $ref(`${view}.labels.controls[0]`),
                        3: $ref(`${view}.layout.controls[0]`)
                    }
                },
                2: {
                    id: 'interact',
                    name: 'Interact',
                    items: {
                        length: 2,
                        0: $ref(`${view}.selection.controls[0]`),
                        1: $ref(`${view}.selection.controls[1]`)
                    }
                },
                3: {
                    id: 'query',
                    name: 'Query',
                    items: {
                        length: 2,
                        0: $ref(`${view}.filters.controls[0]`),
                        1: $ref(`${view}.exclusions.controls[0]`)
                    }
                },
                4: {
                    id: 'inspect',
                    name: 'Inspect',
                    items: {
                        length: 3,
                        0: $ref(`${view}.histograms.controls[0]`),
                        1: $ref(`${view}.inspector.controls[0]`),
                        2: $ref(`${view}.legend.controls[0]`)
                        //3: $ref(`${view}.timebar.controls[0]`),
                    }
                },
                5: {
                    id: 'workbook',
                    name: 'Workbook',
                    items: {
                        length: 3,
                        0: $ref(`${workbook}.controls[0]`),
                        1: $ref(`${workbook}.controls[1]`),
                        2: $ref(`${workbook}.controls[3]`)
                    }
                }
            }
        }
    };
}

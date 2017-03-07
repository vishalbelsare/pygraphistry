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
                length: 6, ...[[
                        $ref(`${view}.camera.controls[0]`),
                        $ref(`${view}.camera.controls[1]`),
                        $ref(`${view}.camera.controls[2]`),
                    ], [
                        $ref(`${workbook}.controls[0]`),
                        $ref(`${workbook}.controls[1]`),
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
                        $ref(`${view}.exclusions.controls[0]`),
                        $ref(`${view}.filters.controls[0]`),
                    ], [
                        $ref(`${workbook}.controls[3]`),
                    ]
                ]
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

import { ref as $ref, atom as $atom } from 'reaxtor-falcor-json-graph';

export function toolbar(workbookId, viewId) {
    const workbook = `workbooksById['${workbookId}']`;
    const view = `${workbook}.viewsById['${viewId}']`;
    return {
        toolbar: $ref(`${view}.toolbars['stable']`),
        toolbars: {
            stable: {
                visible: true,
                length: 4, ...[
                    $ref(`${view}.scene.camera.controls`),
                    $ref(`${view}.scene.controls`),
                    $ref(`${view}.scene.selection.controls`),
                    [
                        $ref(`${view}.histograms.controls[0]`),
                        $ref(`${view}.inspector.controls[0]`),
                        $ref(`${view}.timebar.controls[0]`),
                        $ref(`${view}.exclusions.controls[0]`),
                        $ref(`${view}.filters.controls[0]`),
                        // $ref(`${view}.sets.controls[0]`),
                    ]
                ]
            },
            beta: {
                visible: true,
                length: 4, ...[
                    $ref(`${view}.scene.camera.controls`),
                    $ref(`${view}.scene.controls`),
                    $ref(`${view}.scene.selection.controls`),
                    [
                        $ref(`${view}.histograms.controls[0]`),
                        $ref(`${view}.inspector.controls[0]`),
                        $ref(`${view}.timebar.controls[0]`),
                        $ref(`${view}.exclusions.controls[0]`),
                        $ref(`${view}.filters.controls[0]`),
                        $ref(`${view}.sets.controls[0]`),
                    ]
                ]
            },
            iFrame: {
                visible: true,
                length: 1, ...[[
                    $ref(`${workbook}.controls[0]`),
                    $ref(`${workbook}.controls[1]`),
                ]]
            },
        },
    };
}

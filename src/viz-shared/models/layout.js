import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

export function layout(workbookId, viewId) {
    const view = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        layout: {
            id: 'layout',
            name: 'Layout',
            settings: [
                $ref(`${view}.layout.options`)
            ],
            controls: [{
                id: 'toggle-layout-settings',
                name: 'Layout settings',
                type: 'toggle',
                value: 0,
                values: $atom([[
                    $value(`${view}.panels.left`, $atom(undefined))
                ], [
                    $value(`${view}.panels.left`, $ref(`${view}.layout`)),
                    $value(`${view}.scene.controls[1].value`, $atom(0)),
                    $value(`${view}.labels.controls[0].value`, $atom(0)),
                    $value(`${view}.sets.controls[0].value`, $atom(0)),
                    $value(`${view}.filters.controls[0].value`, $atom(0)),
                    $value(`${view}.exclusions.controls[0].value`, $atom(0)),
                ]])
            }],
            options: {
                id: 'layout-options',
                name: 'Layout',
                length: 0
            }
        }
    };
}

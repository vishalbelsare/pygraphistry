import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

export function selection(workbookId, viewId) {
    const view = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        selection: {
            type: $atom(undefined),
            rect: $atom(undefined),
            label: $atom(undefined),
            edge: [],
            point: [],
            controls: [{
                id: 'toggle-select-nodes',
                name: 'Select nodes',
                type: 'toggle',
                value: 0,
                values: $atom([[
                    $value(`${view}.selection.type`, $atom(undefined)),
                ], [
                    $value(`${view}.selection.type`, $atom('select')),
                    $value(`${view}.panels.bottom`, $ref(`${view}.inspector`)),
                    $value(`${view}.selection.controls[1].value`, $atom(0)),
                    $value(`${view}.inspector.controls[0].value`, $atom(1)),
                    $value(`${view}.timebar.controls[0].value`, $atom(0)),
                ]])
            }, {
                id: 'toggle-window-nodes',
                name: 'Data brush',
                type: 'toggle',
                value: 0,
                values: $atom([[
                    $value(`${view}.selection.type`, $atom(undefined)),
                ], [
                    $value(`${view}.selection.type`, $atom('window')),
                    $value(`${view}.panels.bottom`, $ref(`${view}.inspector`)),
                    $value(`${view}.selection.controls[0].value`, $atom(0)),
                    $value(`${view}.inspector.controls[0].value`, $atom(1)),
                    $value(`${view}.timebar.controls[0].value`, $atom(0)),
                ]]),
            }]
        }
    }
}

import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

export function timebar(workbookId, viewId) {
    const view = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        timebar: {
            open: false,
            id: 'timebar',
            name: 'Timebar',
            controls: [{
                id: 'toggle-timebar',
                name: 'Timebar',
                type: 'toggle',
                value: 0,
                values: $atom([[
                    $value(`${view}.panels.bottom`, $atom(undefined))
                ], [
                    $value(`${view}.panels.bottom`, $ref(`${view}.timebar`)),
                    $value(`${view}.inspector.controls[0].value`, $atom(0)),
                ]])
            }]
        }
    };
}

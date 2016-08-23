import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';

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
                stateKey: 'bottom',
                state: $ref(`${view}.panels`),
                value: $atom(undefined),
                values: $atom([$ref(`${view}.timebar`), $atom(undefined)])
            }]
        }
    };
}

import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

export function selection(workbookId, viewId) {
    const view = `workbooksById['${workbookId}'].viewsById['${viewId}']`;
    return {
        highlight: {
            label: null,
            edge: [],
            point: [],
        },
        selection: {
            type: null,
            rect: null,
            label: null,
            edge: [], point: [],
            controls: [{
                selected: false,
                view: $ref(`${view}`),
                id: 'toggle-select-nodes',
                name: 'Select nodes',
            }, {
                selected: false,
                view: $ref(`${view}`),
                id: 'toggle-window-nodes',
                name: 'Data brush',
            }]
        }
    }
}

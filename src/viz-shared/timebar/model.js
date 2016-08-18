import { ref as $ref, atom as $atom } from 'reaxtor-falcor-json-graph';

export function timebar(workbookId, viewId) {
    return {
        timebar: {
            open: false,
            name: 'Timebar'
        }
    };
}

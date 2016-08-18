import { ref as $ref, atom as $atom } from 'reaxtor-falcor-json-graph';

export function exclusions(workbookId, viewId) {
    return {
        exclusionsById: {},
        exclusions: {
            length: 0,
            open: false,
            name: 'Exclusions',
        }
    }
}

import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

export function inspector(view) {
    return {
        inspector: {
            open: false,
            length: 0,
            id: 'inspector',
            name: 'Data inspector',
            query: {
                openTab: 'points', // 'edges', 'events', ...
                sort: 'none', //{'attribute': 'x', isAscending: 'y'}
                rowsPerPage: 10,
                columns: []
            },
            rows: {
                length: 0
                //0: {cells: {column: x, value: y}}
            },
            edges: $ref(`${view}.selection.edges`),
            points: $ref(`${view}.selection.points`),
            controls: [{
                selected: false,
                id: 'toggle-inspector',
                name: 'Inspector',
            }]
        }
    }
}

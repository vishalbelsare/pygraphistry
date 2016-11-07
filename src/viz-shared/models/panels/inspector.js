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
            openTab: 'points', // 'edges', 'events', ...
            templates: $ref(`${view}.columns`),
            currentQuery: $ref(`${view}.inspector.queries.points`),
            currentRows: $ref(`${view}.inspector.rows.points.search-.sort-_title.asc`),
            queries: {
                points: { //table
                    searchTerm: '',
                    sortKey: '_title', //int or string column reference
                    sortOrder: 'asc', // or 'desc'
                    rowsPerPage: 6, //fix CSS if we want to do more
                    page: 1,
                    //rows: $ref(`${view}.inspector.rows.points.search-.community_infomap.asc`)
                },
                edges: { //table
                    searchTerm: '',
                    sortKey: '_title', //int or string column reference
                    sortOrder: 'asc', // or 'desc'
                    rowsPerPage: 6, //fix CSS if we want to do more
                    page: 1,
                    //rows: $ref(`${view}.inspector.rows.edges.search-._title.asc`),
                }
            },
            rows: {
                points: { //table
                    'search-': {  //search term -- "search:asdf xya"
                        'sort-': { //sort column
                            'asc': {
                                count: 0 //# search hits; independent of visible page
                                //0: { field1, ... },
                                //1: { field1, ... }
                                //...
                            }
                        }
                    }
                }
            },
            controls: [{
                selected: false,
                id: 'toggle-inspector',
                name: 'Inspector',
            }]
        }
    }
}

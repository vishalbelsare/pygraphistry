import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';


export function inspector(view) {
    return {
        componentsByType: { edge: {}, point: {} },
        inspector: {
            open: false,
            length: 0,
            id: 'inspector',
            name: 'Data Table',
            openTab: 'point', // 'edge', 'event', ...
            tabs: [{
                name: 'Points',
                componentType: 'point'
            }, {
                name: 'Edges',
                componentType: 'edge'
            }],
            templates: $ref(`${view}.columns`),
            currentQuery: $ref(`${view}.inspector.queries.point`),
            queries: {
                point: { //table
                    page: 1,
                    searchTerm: '',
                    sortKey: '_title', //int or string column reference
                    sortOrder: 'asc', // or 'desc'
                    componentType: 'point',
                    columns: $atom([])
                    //rows: $ref(`${view}.inspector.rows.point.search-.community_infomap.asc`)
                },
                event: { //table
                    page: 1,
                    searchTerm: '',
                    sortKey: '_title', //int or string column reference
                    sortOrder: 'asc', // or 'desc'
                    componentType: 'edge',
                    columns: $atom([])
                    //rows: $ref(`${view}.inspector.rows.event.search-._title.asc`),
                },
                edge: { //table
                    page: 1,
                    searchTerm: '',
                    sortKey: '_title', //int or string column reference
                    sortOrder: 'asc', // or 'desc'
                    componentType: 'edge',
                    columns: $atom([])
                    //rows: $ref(`${view}.inspector.rows.edge.search-._title.asc`),
                }
            },
            rows: {
                point: { //table
                    'sortBy:_title': { //sort column
                        'asc': {
                            'search:': {  //search term -- "search:asdf xya"
                                length: 0 //# search hits; independent of visible page
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
                name: 'Data Table',
            }]
        }
    }
}

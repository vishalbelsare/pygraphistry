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
                searchTerm: '',
                sortKey: 'community_infomap', //int or string column reference
                sortOrder: 'asc', // or 'desc'
                rowsPerPage: 6, //fix CSS if we want to do more
                page: 0
            },
            templates: $ref(`${view}.columns`),
            rows: {
                points: { //table
                    'search-': {  //search term -- "search:asdf xya"
                        'community_infomap': { //sort column
                            'asc': [
                                {
                                    "community_infomap": 0,
                                    "pagerank": "Mayer Leonard",
                                    "_title": "Kapowsin",
                                    "state": "Hawaii",
                                    "country": "United Kingdom",
                                    "company": "Ovolo",
                                    "favoriteNumber": 7
                                }, {
                                    "community_infomap": 10,
                                    "pagerank": "Bullwinkle",
                                    "_title": "Moscow",
                                    "stata": null,
                                    "country": "USSR",
                                    "company": "ACME",
                                    "favoriteNumber": 10
                                }
                            ]
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

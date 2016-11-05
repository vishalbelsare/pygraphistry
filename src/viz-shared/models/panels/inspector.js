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
                sortKey: 'id', //int or string column reference
                sortOrder: 'asc', // or 'desc'
                rowsPerPage: 10,
                page: 0
            },
            rows: {
                points: { //table
                    'search-': {  //search term -- "search:asdf xya"
                        id: { //sort column
                            'asc': [
                                {
                                    "id": 0,
                                    "name": "Mayer Leonard",
                                    "city": "Kapowsin",
                                    "state": "Hawaii",
                                    "country": "United Kingdom",
                                    "company": "Ovolo",
                                    "favoriteNumber": 7
                                }, {
                                    "id": 10,
                                    "name": "Bullwinkle",
                                    "city": "Moscow",
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

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
                sortKey: 0, //int or string column reference
                sortOrder: 'asc', // or 'desc'
                rowsPerPage: 10,
                page: 0
            },
            rows: {
                points: [
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
                ],
                edges: [
                    {
                        "id": 0,
                        "name": "Mayer Leonard",
                        "city": "Kapowsin",
                        "state": "Hawaii",
                        "country": "United Kingdom",
                        "company": "Ovolo"
                    }, {
                        "id": 10,
                        "name": "Bullwinkle",
                        "city": "Moscow",
                        "stata": null,
                        "country": "USSR",
                        "company": "ACME"
                    }
                ]
            },
            controls: [{
                selected: false,
                id: 'toggle-inspector',
                name: 'Inspector',
            }]
        }
    }
}

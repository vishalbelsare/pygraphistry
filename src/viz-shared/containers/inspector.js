import { container } from '@graphistry/falcor-react-redux';

import { Inspector as InspectorComponent } from '../components/inspector/inspector';
import { selectInspectorTab } from 'viz-shared/actions/inspector';

import _ from 'underscore';


let Inspector = (a,b,c) => {


    console.log('Inspector', JSON.stringify({a,b,c}));
    const {
        id, name, open,
        query,
        selectInspectorTab,
        templates } = a;
    const { openTab, searchTerm, sortKey, sortOrder, rowsPerPage, page } = query;


    const fakeCell = {
        "community_infomap": 0,
        "pagerank": "Mayer Leonard",
        "_title": "Kapowsin",
        "state": "Hawaii",
        "country": "United Kingdom",
        "company": "Ovolo",
        "favoriteNumber": 7
    };

    const fakeRows = {
        'points': {
            'search-': {
                'community_infomap': {
                    'asc': {
                        0: fakeCell,
                        1: fakeCell,
                        2: fakeCell,
                        3: fakeCell,
                        4: fakeCell,
                        5: fakeCell,
                        6: fakeCell,
                        7: fakeCell,
                        8: fakeCell,
                        9: fakeCell,
                        10: fakeCell
                    }
                }
            }
        }
    };

    return <InspectorComponent
        {...query}
        open={open} templates={templates} onSelect={selectInspectorTab}
        results={fakeRows} />;
};


Inspector = container({
    fragment:  (a, b, c, d) => {

        console.log('fragment input', {a,b,c,d});

        const { query = {}, templates = [], ...props } = a;
        const {openTab='points', searchTerm, sortKey, sortOrder, rowsPerPage=0, page=0, columns=[]}
            = query;

        if (!rowsPerPage) {
            return `{
                id, name, open,
                query: { openTab, searchTerm, sortKey, sortOrder, rowsPerPage, page }
            }`;
        }

        const start = rowsPerPage * page;
        const stop = start + rowsPerPage;

        /* removed while debugging
            rows: {
                ${openTab}: {
                    'search-${searchTerm||''}': {
                        ${sortKey}: {
                            ${sortOrder}: {
                                [${start}..${stop}]: {
                                    community_infomap, pagerank, _title
                                }
                            }
                        }
                    }
                }
            }
        */

        const frag = `{
            id, name, open,
            query: { openTab, searchTerm, sortKey, sortOrder, rowsPerPage, page },
            templates: {
                length, [0...${templates.length}]: {
                    name, dataType, identifier, componentType
                }
            }
        }`;

        console.log('OPEN TAB', openTab);
        console.log("THE QUERY", frag);

        return frag;
    },
    dispatchers: { selectInspectorTab }
})(Inspector);



export { Inspector };

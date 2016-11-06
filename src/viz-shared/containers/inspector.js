import { container } from '@graphistry/falcor-react-redux';

import { Inspector as InspectorComponent } from '../components/inspector/inspector';
import { selectInspectorTab } from 'viz-shared/actions/inspector';

import _ from 'underscore';


let Inspector = (a,b,c) => {


    console.log('Inspector', JSON.stringify({a,b,c}));
    const {
        id, name, open,
        query: { openTab },
        selectInspectorTab } = a;

    return <InspectorComponent openTab={openTab} open={open} onSelect={selectInspectorTab} />;
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

        const frag = `{
            id, name, open,
            query: { openTab, sortKey, sortOrder, rowsPerPage, page },
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
        }`;

        console.log('OPEN TAB', openTab);
        console.log("THE QUERY", frag);

        return frag;
    },
    dispatchers: { selectInspectorTab }
})(Inspector);



export { Inspector };

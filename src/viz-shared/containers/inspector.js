import { container } from '@graphistry/falcor-react-redux';

import { Inspector as InspectorComponent } from '../components/inspector/inspector';
import { selectInspectorTab } from 'viz-shared/actions/inspector';

import _ from 'underscore';


let Inspector = (a,b,c) => {


    console.log('Inspector', JSON.stringify({a,b,c}));
    const {
            openTab = 'points',
            currentQuery = {},
            selectInspectorTab,
            templates = {length: 0}
        } = a;
    const { searchTerm = '', sortKey, sortOrder, rowsPerPage=6, page=1 } = currentQuery;

    return <InspectorComponent
        {...{ searchTerm, sortKey, sortOrder, rowsPerPage, page } }
        open={open} openTab={openTab} templates={templates} onSelect={selectInspectorTab}  />;
};


Inspector = container({
    fragment:  (a, b, c, d) => {

        console.log('fragment input', {a,b,c,d});

        const { queries = {}, templates = [], openTab, ...props } = a;
        const query = queries[openTab] || {};
        const { searchTerm, sortKey, sortOrder, rowsPerPage=0, page=0, columns=[]}
            = query;

        if (!rowsPerPage) {
            return `{
                id, name, open, openTab,
                currentQuery: { searchTerm, sortKey, sortOrder, rowsPerPage, page },
                templates: {
                    length, [0...${templates.length}]: {
                        name, dataType, identifier, componentType
                    }
                }
            }`;
        }


        /* removed while debugging

            //change into currentRows (a ref)?
            //still need to do dynamically to get the cols...

            const start = rowsPerPage * page;
            const stop = start + rowsPerPage;

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

            //dynamically list known column names
            ${
                templates
                    .filter(({componentType}) =>
                        (openTab === 'points' && componentType === 'point')
                        || (openTab === 'edges' && componentType === 'edge'))
                    .map(({name}) => name)
                    .join(', ')
            }

        */

        const frag = `{
            id, name, open, openTab,
            currentQuery: { searchTerm, sortKey, sortOrder, rowsPerPage, page },
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

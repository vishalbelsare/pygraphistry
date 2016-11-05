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


        const { query = {}, ...props } = a;
        const {openTab='points', sortKey, sortOrder, rowsPerPage=0, page=0, columns=[]}
            = query;

        if (!rowsPerPage) {
            return `{
                id, name, open,
                query: { openTab, sortKey, sortOrder, rowsPerPage, page }
            }`;
        }

        const start = rowsPerPage * page;
        const stop = start + rowsPerPage;

        console.log('fragment input', JSON.stringify({a,b, c, d}));
        console.log("frag q input", {rowsPerPage, page});

        const frag = `{
            id, name, open,
            query: { openTab, sortKey, sortOrder, rowsPerPage, page },
            rows: {
                ${openTab}: {
                    [${start}..${stop}]: {id}
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

import { container } from '@graphistry/falcor-react-redux';

import { Inspector as InspectorComponent } from '../components/inspector/inspector';
import { selectInspectorTab } from 'viz-shared/actions/inspector';


let Inspector = ({ selectInspectorTab, open = false, allColumns, query = {}, rows, ...props} = {}) => {

    const {openTab = 'points'} = query;

    console.log('Inspector', JSON.stringify({openTab, open, rows, allColumns, query}));

    return <InspectorComponent openTab={openTab} open={open} onSelect={selectInspectorTab} />;
};


Inspector = container({
    fragment:  ({ allColumns = [], query = {} }) => {

        const {openTab='points', sortKey, sortOrder, rowsPerPage=0, page=0, columns=[]}
            = query;

        const start = rowsPerPage * page;
        const stop = start + rowsPerPage - 1;

        console.log("frag q input", {rowsPerPage, page});
        console.log("fragment", allColumns, query);

        //rows[${openTab}][${sortKey || 'any'}][${sortOrder}][${start}..${stop}][${columns}]
        /*
          query: { openTab, sortKey, sortOrder, rowsPerPage, page, columns },
            rows: {
                ${openTab}: {
                    length
                }
            }*/
        return `{
            id, name, open,
            allColumns: {
                length, [0...${allColumns.length}]: {
                    name, dataType, identifier, componentType
                }
            },
            rows: {
                ${openTab}[${start}..${stop}]
            }
        }`;
    },
    dispatchers: { selectInspectorTab }
})(Inspector);



export { Inspector };

import { container } from '@graphistry/falcor-react-redux';

import { Inspector as InspectorComponent } from '../components/inspector/inspector';
import { selectInspectorTab } from 'viz-shared/actions/inspector';


let Inspector = ({ selectInspectorTab, open = false, query = {}, ...props} = {}) => {

    const {openTab = 'points'} = query;

    return <InspectorComponent openTab={openTab} open={open} onSelect={selectInspectorTab} />;
};


Inspector = container({
    fragment:  (inspector) => {

        const {openTab='points', sortKey, sortOrder,
            rowsPerPage=0, page=0, columns=[]} = inspector.query || {};

        const start = rowsPerPage * page;
        const stop = start + rowsPerPage - 1;
        return `{
            id, name, open,
            query: { openTab, sortKey, sortOrder, rowsPerPage, page, columns }
        }`;
    },
    dispatchers: { selectInspectorTab }
})(Inspector);



export { Inspector };

import { container } from '@graphistry/falcor-react-redux';

import { Inspector as InspectorComponent } from '../components/inspector/inspector';
import { selectInspectorTab } from 'viz-shared/actions/inspector';

import _ from 'underscore';


function getTemplates(templates, openTab) {
    return templates
        .filter(({componentType}) =>
            (openTab === 'points' && componentType === 'point')
            || (openTab === 'edges' && componentType === 'edge'))
        .map(({name}) => name);
}

function coerceSortKey(templates, openTab, sortKey) {
    return !sortKey ? getTemplates(templates, openTab).concat([''])[0] : sortKey;
}


let Inspector = ({
        openTab = 'points', currentQuery = {}, selectInspectorTab,
        templates = {length: 0}, rows }) => {

    const { searchTerm = '', sortKey, sortOrder, rowsPerPage=6, page=1 } = currentQuery;

    const sortBy = coerceSortKey(templates, openTab, sortKey);

    var currentRows = undefined;
    try { currentRows = rows[openTab][`search-${searchTerm||''}`][`sort-${sortBy||''}`][sortOrder];
    } catch (e) { }

    return <InspectorComponent
        {...{ searchTerm, sortKey: sortBy, sortOrder, rowsPerPage, page } }
        open={open} openTab={openTab} templates={templates}
        rows={currentRows}
        onSelect={selectInspectorTab}  />;
};


Inspector = container({
    fragment:  ({ currentQuery = {}, templates = [], openTab, ...props }) => {

        const { searchTerm, sortKey, sortOrder, rowsPerPage=0, page=1}
            = currentQuery;

        const sortBy = coerceSortKey(templates, openTab, sortKey);

        const hasAllQueryProps =
            _.intersection(['searchTerm', 'sortKey', 'sortOrder'], _.keys(currentQuery)).length === 3;

        const hasAllTemplateNames =
            templates.length === 0
            || (templates.length === _.keys(templates).length - 1);

        if (!rowsPerPage || !hasAllQueryProps || !hasAllTemplateNames) {
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


        const start = rowsPerPage * (page - 1);
        const stop = start + rowsPerPage;

        return `{
            id, name, open, openTab,
            currentQuery: { searchTerm, sortKey, sortOrder, rowsPerPage, page },
            templates: {
                length, [0...${templates.length}]: {
                    name, dataType, identifier, componentType
                }
            },
            rows: {
                ${openTab}: {
                    'search-${searchTerm||''}': {
                        'sort-${sortBy||''}': {
                            ${sortOrder}: {
                                [${start}..${stop}]: {
                                    ${ getTemplates(templates, openTab).join(', ') }
                                }
                            }
                        }
                    }
                }
            }
        }`;

    },
    dispatchers: { selectInspectorTab }
})(Inspector);



export { Inspector };

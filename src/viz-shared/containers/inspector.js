import {
    atom as $atom,
} from '@graphistry/falcor-json-graph';

import { container } from '@graphistry/falcor-react-redux';

import { Inspector as InspectorComponent } from '../components/inspector/inspector';
import {
    selectInspectorTab, setInspectorPage, setInspectorSortKey,
    setInspectorSortOrder, setInspectorSearchTerm, setInspectorColumns
} from 'viz-shared/actions/inspector';

import _ from 'underscore';


function getTemplates(templates, openTab) {
    const componentToTab = {'point': 'points', 'edge': 'edges'};
    const blacklist = {
        '__defaultPointSize': true,
        '__pointCommunity': true
    };
    return templates
        .filter(({name}) => !blacklist[name])
        .filter(({componentType}) => componentToTab[componentType] === openTab);
}

function coerceSortKey(templates, openTab, sortKey) {
    return !sortKey
        ? getTemplates(templates, openTab).concat([{name:''}])[0].name
        : sortKey;
}


let Inspector = ({
        openTab = 'points', currentQuery = {},

        selectInspectorTab, setInspectorPage, setInspectorSortKey,
        setInspectorSortOrder, setInspectorSearchTerm, setInspectorColumns,

        templates = {length: 0}, rows }) => {

    const { searchTerm = '', sortKey, sortOrder, rowsPerPage=6, page=1, columns=[] } = currentQuery;

    const sortBy = coerceSortKey(templates, openTab, sortKey);

    var count = 0;
    var currentRows = undefined;
    try {
        count = rows[openTab][`search-${searchTerm||''}`][`sort-${sortBy||''}`][sortOrder].count;
        currentRows = rows[openTab][`search-${searchTerm||''}`][`sort-${sortBy||''}`][sortOrder];
    } catch (e) {
        console.warn('Maybe exn', e);
    }

    return <InspectorComponent
        {...{ searchTerm, sortKey: sortBy, sortOrder, rowsPerPage, page } }
        columns={ columns.columns? columns.columns : columns }
        numPages={Math.ceil(count / rowsPerPage)}
        open={open} openTab={openTab} templates={getTemplates(templates, openTab)}
        rows={currentRows}
        onPageSelect={setInspectorPage}
        onSelect={selectInspectorTab}
        onColumnsSelect={setInspectorColumns}
        toggleColumnSort={ ({name}) => {
            if (name === sortBy) {
                setInspectorSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
            } else {
                setInspectorSortKey(name);
                setInspectorSortOrder('asc');
            }
        }}
        />;
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
                currentQuery: { searchTerm, sortKey, sortOrder, rowsPerPage, page, columns },
                templates: {
                    length, [0...${templates.length}]: {
                        name, dataType, identifier, componentType
                    }
                }
            }`;
        }


        const start = rowsPerPage * (page - 1);
        const stop = start + Math.max(rowsPerPage, 1) - 1;

        return `{
            id, name, open, openTab,
            currentQuery: { searchTerm, sortKey, sortOrder, rowsPerPage, page, columns },
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
                                count,
                                [${start}..${stop}]: {
                                    ${ getTemplates(templates, openTab)
                                        .map(({name}) => name).join(', ') }
                                }
                            }
                        }
                    }
                }
            }
        }`;

    },
    dispatchers: {
        selectInspectorTab, setInspectorPage, setInspectorSortKey,
        setInspectorSortOrder, setInspectorSearchTerm, setInspectorColumns
    }
})(Inspector);



export { Inspector };

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


let Inspector = ({ open, rows = {}, templates = [],
                   loading = false, currentQuery = {},
                   openTab = 'points', setInspectorPage,
                   selectInspectorRow, selectInspectorTab,
                   setInspectorSortKey, setInspectorColumns,
                   setInspectorSortOrder, setInspectorSearchTerm }) => {

    const { searchTerm = '', sortKey, sortOrder, rowsPerPage=6, page=1, columns=[] } = currentQuery;
    const sortBy = coerceSortKey(templates, openTab, sortKey);
    const sortByKey = `sort-${sortBy||''}`;
    const searchKey = `search-${searchTerm||''}`;

    const { [openTab]: openRows = {} } = rows;
    const { [searchKey]: searchRows = {} } = openRows;
    const { [sortByKey]: sortedByRows = {} } = searchRows;
    const { [sortOrder]: sortedByOrder = {} } = sortedByRows;
    const { count: sortedRowCount = 0 } = sortedByOrder;

    return (
        <InspectorComponent open={open}
                            page={page}
                            sortKey={sortBy}
                            openTab={openTab}
                            rows={sortedByOrder}
                            sortOrder={sortOrder}
                            dataLoading={loading}
                            searchTerm={searchTerm}
                            rowsPerPage={rowsPerPage}
                            onSelect={selectInspectorTab}
                            onPageSelect={setInspectorPage}
                            onRowSelect={selectInspectorRow}
                            onSearch={setInspectorSearchTerm}
                            onColumnsSelect={setInspectorColumns}
                            templates={getTemplates(templates, openTab)}
                            numPages={Math.ceil(sortedRowCount / rowsPerPage)}
                            columns={ columns.columns ? columns.columns : columns }
                            toggleColumnSort={ ({name}) => {
                                if (name === sortBy) {
                                    setInspectorSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                } else {
                                    setInspectorSortKey(name);
                                    setInspectorSortOrder('asc');
                                }
                            }}/>
        );
};


Inspector = container({
    renderLoading: true,
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
                                        .map(({name}) => `"${name}"`)
                                        .map(name => name)
                                        .concat('_index')
                                        .join(', ') }
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

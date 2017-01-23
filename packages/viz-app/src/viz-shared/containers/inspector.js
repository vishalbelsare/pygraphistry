import compose from 'recompose/compose';
import { Observable } from 'rxjs/Observable';
import { container } from '@graphistry/falcor-react-redux';
import { Inspector as InspectorComponent } from 'viz-shared/components/inspector';
import {
    selectInspectorTab, setInspectorSortKey,
    setInspectorSearchTerm, setInspectorColumns
} from 'viz-shared/actions/inspector';

import { WithGridLayout, WithScrollPosition } from 'viz-shared/components/data-grid';

let Inspector = container({
    renderLoading: true,
    fragment: (fragment, props) => {

        const { rowHeight, startRow, rowsPerPage } = props;
        const { rows, query, columns, templates, allTemplatesLength } = getInspectorState(fragment);

        const from = Math.max(0, Math.min(rows.length - rowsPerPage - 1, startRow));
        const to = Math.min(rows.length, from + rowsPerPage * 2);
        const columnNames = (columns.length && columns[0] ?
                                columns : templates).map(
                                    ({ name }) => name).concat('_index');

        return `{
            id, name, open, openTab,
            currentQuery: {
                columns, sortKey, sortOrder, searchTerm
            },
            templates: {
                length, [0...${allTemplatesLength}]: {
                    name, dataType, identifier, componentType
                }
            },
            rows: {
                ${query.reduceRight((next, key) =>
                    `['${key}']: {
                        ${next}
                    }`,
                    `length, [${from}...${to}]: {
                        ${columnNames.map((x) => `'${escapeQuotes(x)}'`)}
                    }`
                )}
            }
        }`;
    },
    mapFragment: (fragment, props) => {

        let { startCol, startRow } = props;
        const { width, height, scrollTop,
                colHeaderWidth, rowHeaderHeight,
                colWidth, rowHeight, colsPerPage, rowsPerPage } = props;

        const { rows, columns, templates,
                openTab, sortKey, sortOrder, searchTerm } = getInspectorState(fragment);

        const cols = (columns.length && columns[0] ? columns : templates);

        const bodyWidth = colWidth * cols.length;
        const bodyHeight = rowHeight * rows.length;

        const numPages = Math.ceil((bodyHeight - height) / (rowHeight * rowsPerPage)) || 1;
        const page = 1 + Math.max(0, Math.min(numPages - 1, Math.floor(
            ((scrollTop - rowHeaderHeight) / rowHeight) / rowsPerPage)));

        startCol = Math.max(0, Math.min(cols.length - colsPerPage - 1, startCol));
        startRow = Math.max(0, Math.min(rows.length - rowsPerPage - 1, startRow));

        const endRow = Math.min(rows.length, startRow + rowsPerPage * 2) || 0;
        const rowsSortedByOrder = new Array(endRow - startRow);

        for (let i = -1, n = endRow - startRow; ++i < n;) {
            const row = rows[startRow + i];
            rowsSortedByOrder[i] = row ? row : {
                rowIsLoading: true, pendingIndex: startRow + i
            };
        }

        return {
            ...fragment,
            startCol, startRow,
            templates, columns,
            cols, rows: rowsSortedByOrder,
            bodyWidth, bodyHeight, page, numPages,
            openTab, sortKey, sortOrder, searchTerm,
            rowsPerPage: Math.max(rowsPerPage, Math.min(rowsPerPage + 2, rows.length - startRow)),
            colsPerPage: Math.max(colsPerPage, Math.min(colsPerPage + 2, cols.length - startCol)),
        };
    },
    dispatchers: {
        onSort: setInspectorSortKey,
        onSelect: selectInspectorTab,
        onSearch: setInspectorSearchTerm,
        onColumnsSelect: setInspectorColumns,
    }
});

Inspector = compose(
    WithScrollPosition,
    WithGridLayout,
    Inspector
)(InspectorComponent);

export { Inspector };

function getInspectorState(fragment) {

    let { templates = [] } = fragment;
    const { length: allTemplatesLength } = templates;
    const { currentQuery = {}, openTab = 'point' } = fragment;

    templates = getTemplatesForTab(templates, openTab);

    const sortKey = coerceSortKey(templates, currentQuery.sortKey);
    const { columns = [], sortOrder = 'asc', searchTerm = '' } = currentQuery;

    let query = [{ key: 'componentType', val: openTab }];
    sortKey && query.push({ key: 'sortKey', val: sortKey });
    sortOrder && query.push({ key: 'sortOrder', val: sortOrder });
    searchTerm && query.push({ key: 'searchTerm', val: searchTerm.toLowerCase() });

    query = query.map(({ key, val }) => (
        (key ===    'sortKey') ? `sortBy:${escapeQuotes(val)}` :
        (key === 'searchTerm') ? `search:${escapeQuotes(val)}` : val
    ));

    const rows = query.reduce((node, key, index) => (
        node[key] || (
        node[key] = (index < query.length - 1) ? {} : [])
    ), fragment.rows || {});

    return {
        rows, query, columns,
        templates, allTemplatesLength,
        openTab, sortKey, sortOrder, searchTerm
    };
}

const blacklist = {
    __pointCommunity: true,
    __defaultPointSize: true
};

function escapeQuotes(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function mapKeyIdToKey(keyId, query) {
    let key = query[keyId];
    key = keyId === 'sortKey' && `sortBy:${key}` || key;
    key = keyId === 'searchTerm' && `search:${key}` || key;
    return key;
}

function getTemplatesForTab(templates = [], componentType) {
    return Array.from(templates).filter((template) => (
        template && !blacklist[template.name] &&
        template.componentType === componentType
    ));
}

function coerceSortKey(templates, sortKey) {
    return sortKey || (
        templates.length > 0 && templates[0] ?
            templates[0].name : '_title');
}

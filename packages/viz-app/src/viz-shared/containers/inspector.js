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
    fragment: (fragment, props = {}) => {

        const { tabs, rows, query, columns, templates, allTemplatesLength } = getInspectorState(fragment);

        if (!fragment || !fragment.currentQuery || !(templates[0] || columns[0])) {
            return `{
                id, name, open, openTab, tabs: {
                    length, [0...${tabs.length}]
                },
                currentQuery: {
                    columns, sortKey, sortOrder, searchTerm
                },
                templates: {
                    length, [0...${allTemplatesLength || 0}]: {
                        name, isPrivate, isInternal, dataType, identifier, componentType
                    }
                }
            }`;
        }

        const { startCol = 0, colsPerPage = 0 } = props;
        const { startRow = 0, rowsPerPage = 0 } = props;
        const from = Math.max(0, startRow - rowsPerPage * 2 - 1) || 0;
        const to = Math.min(rows.length, startRow + rowsPerPage * 2 + 1) || 0;
        const columnNames = (columns.length && columns[0] ? columns : templates)
            .slice(startCol, startCol + colsPerPage + 2)
            .map(({ name }) => name);

        return `{
            id, name, open, openTab, tabs: {
                length, [0...${tabs.length}]
            },
            currentQuery: {
                columns, sortKey, sortOrder, searchTerm
            },
            templates: {
                length, [0...${allTemplatesLength}]: {
                    name, isPrivate, isInternal, dataType, identifier, componentType
                }
            },
            rows: {
                ${query.reduceRight((next, key) =>
                    `['${key}']: {
                        ${next}
                    }`,
                    `length, [${from}...${to}]: {
                        _title, _index, ${columnNames
                            .map((x) => `'${escapeQuotes(x)}'`)
                            .join(', ')
                        }
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
        const bodyHeight = rowHeight * (rows.length + (rowsPerPage - rows.length % rowsPerPage));

        startCol = Math.max(0, Math.min(cols.length - 1, startCol)) || 0;
        startRow = Math.max(0, Math.min(rows.length - 1, startRow)) || 0;

        const endRow = Math.min(rows.length - 1, startRow + rowsPerPage) || 0;
        const lastRenderedRowIndex = Math.max(rowsPerPage, endRow - startRow) +
                                    (scrollTop + rowHeaderHeight) / rowHeight;

        const rowsToRender = new Array(rowsPerPage + 2);
        const numPages = rows.length && Math.ceil(bodyHeight / (rowHeight * rowsPerPage)) || 0;
        const page = Math.max(1, Math.min(numPages, Math.floor(lastRenderedRowIndex / rowsPerPage)));

        for (let i = -1, n = rowsPerPage + 2; ++i < n;) {
            const row = rows[startRow + i];
            if (startRow + i >= rows.length) {
                rowsToRender[i] = null;
            } else {
                rowsToRender[i] = row ? row : {
                    rowIsLoading: true, pendingIndex: startRow + i + 1
                };
            }
        }

        return {
            ...fragment,
            startCol, startRow,
            templates, columns,
            bodyWidth: bodyWidth + colHeaderWidth,
            bodyHeight: bodyHeight + rowHeaderHeight,
            openTab, sortKey, sortOrder, searchTerm,
            cols, rows: rowsToRender, page, numPages,
            rowsPerPage: rowsPerPage + 2,
            colsPerPage: Math.max(1 + colsPerPage, Math.min(colsPerPage + 2, cols.length - startCol)),
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

function getInspectorState(fragment = []) {

    let { tabs = [], templates = [] } = fragment;
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
        tabs, rows, query, columns,
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
    if (componentType === 'event') {
        componentType = 'point';
    }
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

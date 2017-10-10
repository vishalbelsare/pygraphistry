export const SELECT_INSPECTOR_TAB = 'select-inspector-tab';
export const SELECT_INSPECTOR_ROW = 'select-inspector-row';
export const SET_INSPECTOR_PAGE = 'set-inspector-page';
export const SET_INSPECTOR_SORT_KEY = 'set-inspector-sort-key';
export const SET_INSPECTOR_SORT_ORDER = 'set-inspector-sort-order';
export const SET_INSPECTOR_SEARCH_TERM = 'set-inspector-search-term';
export const SET_INSPECTOR_COLUMNS = 'set-inspector-columns';

export const selectInspectorTab = openTab => {
  return { openTab, type: SELECT_INSPECTOR_TAB };
};

export const selectInspectorRow = props => {
  return { ...props, type: SELECT_INSPECTOR_ROW };
};

export const setInspectorPage = page => {
  return { page, type: SET_INSPECTOR_PAGE };
};

export const setInspectorSortKey = sortKey => {
  return { sortKey, type: SET_INSPECTOR_SORT_KEY };
};

export const setInspectorSortOrder = order => {
  return { order, type: SET_INSPECTOR_SORT_ORDER };
};

export const setInspectorSearchTerm = term => {
  return { term, type: SET_INSPECTOR_SEARCH_TERM };
};

export const setInspectorColumns = columns => {
  return { columns, type: SET_INSPECTOR_COLUMNS };
};

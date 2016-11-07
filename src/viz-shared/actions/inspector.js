export const SELECT_INSPECTOR_TAB = 'select-inspector-tab';
export const SET_INSPECTOR_PAGE = 'set-inspector-page';

export const selectInspectorTab = (openTab) => {
    return {openTab, type: SELECT_INSPECTOR_TAB};
};

export const setInspectorPage = (page) => {
    return {page, type: SET_INSPECTOR_PAGE};
};

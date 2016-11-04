export const SELECT_INSPECTOR_TAB = 'select-inspector-tab';

export const selectInspectorTab = ({ tab, ...props }) => ({
    tab, ...props, type: SELECT_INSPECTOR_TAB
});

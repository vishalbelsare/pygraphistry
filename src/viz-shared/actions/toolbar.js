export const SELECT_TOOLBAR_ITEM = 'select-toolbar-item';

export const selectToolbarItem = ({ type, ...props } = {}) => ({
    ...props, controlType: type, type: SELECT_TOOLBAR_ITEM
});

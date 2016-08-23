export const SELECT_TOOLBAR_ITEM = 'select-toolbar-item';

export const selectToolbarItem = ({ type, ...props } = {}) => ({
    type: SELECT_TOOLBAR_ITEM, ...props, controlType: type
});

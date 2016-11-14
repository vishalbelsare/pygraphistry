export const SELECT_LABEL = 'select-label';
export const ADD_LABEL_FILTER = 'add-label-filter';
export const ADD_LABEL_EXCLUSION = 'add-label-exclusion';

export const LABEL_MOUSE_MOVE = 'label-mouse-move';
export const LABEL_TOUCH_START = 'label-touch-start';
export const LABEL_SETTINGS_UPDATE = 'label-settings-update';

export const addFilter = () => ({
    type: ADD_LABEL_FILTER
});

export const addExclusion = () => ({
    type: ADD_LABEL_EXCLUSION
});

export const selectLabel = () => ({
    type: SELECT_LABEL
});

export const labelMouseMove = (props) => ({
    ...props, type: LABEL_MOUSE_MOVE
});

export const labelTouchStart = (props) => ({
    ...props, type: LABEL_TOUCH_START
});

export const SELECT_LABEL = 'select-label';
export const LABEL_MOUSE_MOVE = 'label-mouse-move';
export const ADD_LABEL_FILTER = 'add-label-filter';
export const ADD_LABEL_EXCLUSION = 'add-label-exclusion';

export const addFilter = () => ({
    type: ADD_LABEL_FILTER
});

export const addExclusion = () => ({
    type: ADD_LABEL_EXCLUSION
});

export const selectLabel = ({ event, ...props }) => ({
    event, ...props, type: SELECT_LABEL
});

export const labelMouseMove = ({ event, ...props }) => ({
    event, ...props, type: LABEL_MOUSE_MOVE
});

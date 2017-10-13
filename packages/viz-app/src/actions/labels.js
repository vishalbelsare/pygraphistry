export const SELECT_LABEL = 'select-label';
export const LABEL_MOUSE_MOVE = 'label-mouse-move';

export const selectLabel = props => ({
    ...props,
    type: SELECT_LABEL
});

export const labelMouseMove = props => ({
    ...props,
    type: LABEL_MOUSE_MOVE
});

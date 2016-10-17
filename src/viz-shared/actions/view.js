export const TOUCH_END = 'touch-end';
export const MOUSE_MOVE = 'mouse-move';
export const TOUCH_MOVE = 'touch-move';
export const TOUCH_START = 'touch-start';
export const TOUCH_CANCEL = 'touch-cancel';
export const SELECTED_POINT_TOUCH_START = 'selected-point-touch-start';
export const SELECTION_RECT_TOUCH_START = 'selection-rect-touch-start';

export const touchEnd = ({ event, ...props }) => ({
    event, ...props, type: TOUCH_END
});

export const mouseMove = ({ event, ...props }) => ({
    event, ...props, type: MOUSE_MOVE
});

export const touchMove = ({ event, ...props }) => ({
    event, ...props, type: TOUCH_MOVE
});

export const touchStart = ({ event, ...props }) => ({
    event, ...props, type: TOUCH_START
});

export const touchCancel = ({ event, ...props }) => ({
    event, ...props, type: TOUCH_CANCEL
});

export const onSelectedPointTouchStart = ({ event, ...props }) => ({
    event, ...props, type: SELECTED_POINT_TOUCH_START
});

export const onSelectionRectTouchStart = ({ event, ...props }) => ({
    event, ...props, type: SELECTION_RECT_TOUCH_START
});

export const TOUCH_END = 'touch-end';
export const MOUSE_MOVE = 'mouse-move';
export const TOUCH_MOVE = 'touch-move';
export const TOUCH_START = 'touch-start';
export const TOUCH_CANCEL = 'touch-cancel';
export const POINT_SELECTED = 'point-selected';

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

export const onPointSelected = ({ event, ...props }) => ({
    event, ...props, type: POINT_SELECTED
});

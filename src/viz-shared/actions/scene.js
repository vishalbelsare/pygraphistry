export const SCENE_MOUSE_MOVE = 'mouse-move';
export const SCENE_TOUCH_START = 'touch-start';
export const SELECTED_POINT_TOUCH_START = 'selected-point-touch-start';
export const SELECTION_MASK_TOUCH_START = 'selection-rect-touch-start';

export const sceneMouseMove = ({ event, ...props }) => ({
    event, ...props, type: SCENE_MOUSE_MOVE
});

export const sceneTouchStart = ({ event, ...props }) => ({
    event, ...props, type: SCENE_TOUCH_START
});

export const onSelectedPointTouchStart = ({ event, ...props }) => ({
    event, ...props, type: SELECTED_POINT_TOUCH_START
});

export const onSelectionMaskTouchStart = ({ event, ...props }) => ({
    event, ...props, type: SELECTION_MASK_TOUCH_START
});

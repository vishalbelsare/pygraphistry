export const SCENE_MOUSE_MOVE = 'scene-mouse-move';
export const SCENE_TOUCH_START = 'scene-touch-start';
export const SELECTED_POINT_TOUCH_START = 'selected-point-touch-start';
export const SELECTION_MASK_TOUCH_START = 'selection-rect-touch-start';

export const sceneMouseMove = (props) => ({
    ...props, type: SCENE_MOUSE_MOVE
});

export const sceneTouchStart = (props) => ({
    ...props, type: SCENE_TOUCH_START
});

export const onSelectedPointTouchStart = (props) => ({
    ...props, type: SELECTED_POINT_TOUCH_START
});

export const onSelectionMaskTouchStart = (props) => ({
    ...props, type: SELECTION_MASK_TOUCH_START
});

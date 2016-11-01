export const LABEL_MOUSE_MOVE = 'label-mouse-move';
export const LABEL_TOUCH_START = 'label-touch-start';
export const LABEL_SETTINGS_UPDATE = 'label-settings-update';

export const labelMouseMove = ({ event, ...props }) => ({
    event, ...props, type: LABEL_MOUSE_MOVE
});

export const labelTouchStart = ({ event, ...props }) => ({
    event, ...props, type: LABEL_TOUCH_START
});

export const updateLabelSettings = ({ event, ...props }) => ({
    event, ...props, type: LABEL_SETTINGS_UPDATE
});

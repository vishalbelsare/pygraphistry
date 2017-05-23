export const ADD_HISTOGRAM = 'add-histogram';
export const REMOVE_HISTOGRAM = 'remove-histogram';
export const CLEAR_HIGHLIGHT = 'clear-histogram-highlight';

export const BIN_TOUCH_MOVE = 'histogram-bin-touch-move';
export const BIN_TOUCH_START = 'histogram-bin-touch-start';
export const BIN_TOUCH_CANCEL = `histogram-bin-touch-cancel`;

export const BIN_YSCALE_CHANGED = 'histogram-bin-yScale-changed';
export const BIN_ENCODING_CHANGED = 'histogram-bin-encoding-changed';

export const addHistogram = (props) => ({
    ...props, type: ADD_HISTOGRAM
});

export const removeHistogram = (props) => ({
    ...props, type: REMOVE_HISTOGRAM
});

export const binTouchMove = (props) => ({
    ...props, type: BIN_TOUCH_MOVE
});

export const clearHighlight = (props) => ({
    ...props, type: CLEAR_HIGHLIGHT
});

export const binTouchStart = (props) => ({
    ...props, type: BIN_TOUCH_START
});

export const binTouchCancel = (props) => ({
    ...props, type: BIN_TOUCH_CANCEL
});

export const yScaleChanged = (props) => ({
    ...props, type: BIN_YSCALE_CHANGED
});

export const encodingChanged = (props) => ({
    ...props, type: BIN_ENCODING_CHANGED
});


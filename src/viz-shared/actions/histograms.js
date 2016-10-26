export const ADD_HISTOGRAM = 'add-histogram';
export const REMOVE_HISTOGRAM = 'remove-histogram';
export const UPDATE_HISTOGRAM = 'update-histogram';
export const HIGHLIGHT_HISTOGRAM = 'highight-histogram';
export const CANCEL_HIGHLIGHT_HISTOGRAM = `cancel-${HIGHLIGHT_HISTOGRAM}`;

export const addHistogram = ({ ...props }) => ({
    ...props, type: ADD_HISTOGRAM
});

export const removeHistogram = ({ ...props }) => ({
    ...props, type: REMOVE_HISTOGRAM
});

export const updateHistogram = ({ ...props }) => ({
    ...props, type: UPDATE_HISTOGRAM
});

export const highlightHistogram = ({ ...props }) => ({
    ...props, type: HIGHLIGHT_HISTOGRAM
});

export const cancelHighlightHistogram = ({ ...props }) => ({
    ...props, type: CANCEL_HIGHLIGHT_HISTOGRAM
});

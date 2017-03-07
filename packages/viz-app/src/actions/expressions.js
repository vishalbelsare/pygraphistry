export const ADD_FILTER = 'add-filter';
export const ADD_EXCLUSION = 'add-exclusion';
export const ADD_EXPRESSION = 'add-expression';
export const REMOVE_EXPRESSION = 'remove-expression';
export const UPDATE_EXPRESSION = 'update-expression';
export const SET_EXPRESSION_ENABLED = 'set-expression-enabled';
export const CANCEL_UPDATE_EXPRESSION = `cancel-${UPDATE_EXPRESSION}`;

export const addFilter = (props) => ({
    ...props, type: ADD_FILTER
});

export const addExclusion = (props) => ({
    ...props, type: ADD_EXCLUSION
});

export const addExpression = (props) => ({
    ...props, type: ADD_EXPRESSION
});

export const removeExpression = (props) => ({
    ...props, type: REMOVE_EXPRESSION
});

export const updateExpression = (props) => ({
    ...props, type: UPDATE_EXPRESSION
});

export const setExpressionEnabled = (props) => ({
    ...props, type: SET_EXPRESSION_ENABLED
});

export const cancelUpdateExpression = (props) => ({
    ...props, type: CANCEL_UPDATE_EXPRESSION
});

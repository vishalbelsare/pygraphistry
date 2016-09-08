export const SET_PIVOT_VALUE = 'set-pivot-value';
export const TOGGLE_PIVOT = 'toggle-pivot';

export const setPivotValue = ({ index, target, ...props }) => {
    return ({
        ...props, index, target, type: SET_PIVOT_VALUE
    });
};

export const togglePivot = ({ index, enabled }) => {
    return ({
        index, enabled, type: TOGGLE_PIVOT
    });
};

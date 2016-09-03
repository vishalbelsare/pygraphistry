export const SET_PIVOT_VALUE = 'set-pivot-value';

export const setPivotValue = ({ index, target, ...props }) => {
    return ({
        ...props, index, target, type: SET_PIVOT_VALUE
    });
};

export const SET_PIVOT_VALUE = 'set-pivot-value';
export const SEARCH_PIVOT = 'search-pivot';
export const SPLICE_PIVOT = 'splice-pivot';
export const ADD_PIVOT = 'add-pivot';

export const searchPivot = ({index}) => {
    return ({
        index, type: SEARCH_PIVOT
    });
};

export const splicePivot = ({ index, target, ...props }) => {
    return ({
        ...props, index, target, type: SPLICE_PIVOT
    });
};

export const addPivot = ({ index, target, ...props }) => {
    return ({
        ...props, index, target, type: ADD_PIVOT
    });
};

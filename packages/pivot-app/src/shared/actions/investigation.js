export const SET_PIVOT_VALUE = 'set-pivot-value';
export const SEARCH_PIVOT = 'search-pivot';
export const SPLICE_PIVOT = 'splice-pivot';
export const INSERT_PIVOT = 'insert-pivot';
export const DISMISS_ALERT = 'dismiss-alert';

export const searchPivot = ({index}) => {
    return ({
        index, type: SEARCH_PIVOT
    });
};

export const splicePivot = ({ index }) => {
    return ({
        index, type: SPLICE_PIVOT
    });
};

export const insertPivot = ({ index }) => {
    return ({
        index, type: INSERT_PIVOT
    });
};

export const dismissAlert = () => {
    return ({
        type: DISMISS_ALERT
    });
}

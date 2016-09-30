export const TOGGLE_PIVOT = 'toggle-pivot';
export const SET_PIVOT_PARAMETERS = 'set-pivot-parameters';

export const togglePivot = ({ index, enabled }) => {
    return ({
        index, enabled, type: TOGGLE_PIVOT
    });
};

export function setPivotParameters(params) {
    return {
        params: params,
        type: SET_PIVOT_PARAMETERS
    };
}

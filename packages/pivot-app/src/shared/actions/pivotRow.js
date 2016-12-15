export const TOGGLE_PIVOT = 'toggle-pivot';
export const SET_PIVOT_ATTRIBUTES = 'set-pivot-attributes';

export const togglePivot = ({ index, enabled }) => {
    return ({
        index, enabled, type: TOGGLE_PIVOT
    });
};

export function setPivotAttributes(params, investigationId) {
    return {
        investigationId,
        params: params,
        type: SET_PIVOT_ATTRIBUTES
    };
}

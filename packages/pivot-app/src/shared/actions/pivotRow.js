export const SET_PIVOT_ATTRIBUTES = 'set-pivot-attributes';

export function setPivotAttributes(params) {
    return {
        params: params,
        type: SET_PIVOT_ATTRIBUTES
    };
}

export const SET_PIVOT_ATTRIBUTES = 'set-pivot-attributes';

export function setPivotAttributes(params, investigationId) {
    return {
        investigationId,
        params: params,
        type: SET_PIVOT_ATTRIBUTES
    };
}

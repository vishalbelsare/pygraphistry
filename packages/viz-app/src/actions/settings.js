export const SET_CONTROL_VALUE = 'set-control-value';

export const setControlValue = ({ type, ...props }) => ({
    ...props,
    controlType: type,
    type: SET_CONTROL_VALUE
});

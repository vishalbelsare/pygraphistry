export const SET_INVESTIGATION_NAME = 'set-investigation-value';

export const setInvestigationName = ({ type, ...props }) => ({
    ...props, controlType: type, type: SET_INVESTIGATION_NAME
});

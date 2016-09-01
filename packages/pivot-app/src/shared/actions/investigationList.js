export const SET_INVESTIGATION_NAME = 'set-investigation-value';

export const setInvestigationName = ({ id, type, ...props }) => {
    return ({
        ...props, id: id, type: SET_INVESTIGATION_NAME
    });
}

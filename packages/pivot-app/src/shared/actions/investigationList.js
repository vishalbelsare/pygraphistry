export const SELECT_INVESTIGATION = 'select-investigation';
export const CREATE_INVESTIGATION = 'create-investigation';
export const SET_INVESTIGATION_NAME = 'set-investigation-name';
export const SAVE_INVESTIGATION = 'save-investigation';
export const COPY_INVESTIGATION = 'copy-investigation';

export const selectInvestigation = ({ id, type, ...props }) => {
    return ({
        ...props, id: id, type: SELECT_INVESTIGATION
    });
}

export function createInvestigation() {
    return {type: CREATE_INVESTIGATION};
}

export function setInvestigationName(name) {
    return {
        type: SET_INVESTIGATION_NAME,
        name: name
    };
}

export function saveInvestigation(id) {
    return {
        type: SAVE_INVESTIGATION,
        id: id
    };
}

export function copyInvestigation(id) {
    return {
        type: COPY_INVESTIGATION,
        id: id
    }
}

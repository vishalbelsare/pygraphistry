export const SELECT_INVESTIGATION = 'select-investigation';
export const CREATE_INVESTIGATION = 'create-investigation';
export const SET_INVESTIGATION_PARAMS = 'set-investigation-params';
export const SAVE_INVESTIGATION = 'save-investigation';
export const COPY_INVESTIGATION = 'copy-investigation';
export const DELETE_INVESTIGATIONS = 'delete-investigations';

export function selectInvestigation(id) {
    return {
        id: id,
        type: SELECT_INVESTIGATION
    };
}

export function createInvestigation(userId) {
    return {
        type: CREATE_INVESTIGATION,
        userId: userId
    };
}

export function setInvestigationParams(params, id) {
    return {
        type: SET_INVESTIGATION_PARAMS,
        params: params,
        id: id
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
    };
}

export function deleteInvestigations(userId, investigationIds) {
    return {
        type: DELETE_INVESTIGATIONS,
        userId: userId,
        investigationIds: investigationIds
    };
}

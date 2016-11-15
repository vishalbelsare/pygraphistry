export const CHECK_STATUS = 'check-status';

export function checkStatus(id) {
    console.log('Id', id);
    return {
        id: id,
        type: CHECK_STATUS
    };
}

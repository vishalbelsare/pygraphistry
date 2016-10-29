export const SET_ENCODING = 'set-encoding';
export const RESET_ENCODING = 'reset-encoding';

export const setEncoding = ({ ...props }) => ({
    ...props, type: SET_ENCODING
});

export const resetEncoding = ({ ...props }) => ({
    ...props, type: RESET_ENCODING
});

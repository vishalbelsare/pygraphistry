export const SET_ENCODING = 'set-encoding';

export const setEncoding = ({ ...props }) => ({
    ...props, type: SET_ENCODING
});
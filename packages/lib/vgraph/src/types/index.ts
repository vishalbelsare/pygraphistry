import * as Long from 'long';
import * as colors from './colors';
import * as datetimes from './datetimes';
import sanitizeHTML from 'sanitize-html';

export * from './mapd';
export { colors, datetimes };
export { isDateTimeColumn, dateTimeVectorMapping } from './datetimes';
export { isColorColumn, isColorPaletteColumn, colorVectorMapping } from './colors';

export default {
    float: identity,
    int32: identity,
    double: identity,
    uint32: identity,
    boolean: identity,
    int64: longToString,
    string: decodeAndSanitize
};

function identity(x: any) {
    return x;
}
function longToString(long: Long) {
    return long.toString();
}
function decodeAndSanitize(input) {
    let decoded = input,
        value = input;
    try {
        decoded = decodeURIComponent(input);
    } catch (e) {
        decoded = input;
    }
    try {
        value = sanitizeHTML(decoded);
    } catch (e) {
        value = decoded;
    }
    return value;
}

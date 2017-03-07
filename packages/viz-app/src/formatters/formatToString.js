export function formatToString (value, short = false, limit = 10) {
    const str = String(value);
    if (short === false) {
        return str;
    } else if (str.length > limit) {
        return str.substr(0, limit - 1) + '…';
    } else {
        return str;
    }
}

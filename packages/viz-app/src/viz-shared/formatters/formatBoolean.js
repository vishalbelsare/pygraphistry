export function formatBoolean (value) {
    if (value === true) {
        return '✓';
    } else if (value === false) {
        return '✗';
    } else {
        return '☐';
    }
}

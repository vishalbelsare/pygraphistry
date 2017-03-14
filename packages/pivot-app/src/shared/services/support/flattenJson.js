const flatten = require('flat');

//{x: {y: 1}, z: ['a']} => {"x.y": 1, z.0: 'a'}
export function flattenJson (data = {}) {
    if (data === null) {
        return {};
    }
    return flatten(data);
}
const unbend = require('unbend');

//{x: {y: 1}, z: ['a']} => {"x.y": 1, z.0: 'a'}
export function flattenJson (data = {}) {
    return unbend(
        data,
        {
            separator: '.',
            skipFirstSeparator: true,
            parseArray: true
        });
}
if (typeof Symbol.asyncIterator === 'undefined') {
    Symbol.asyncIterator = Symbol('asyncIterator');
}

const { send } = require('micro');
const { AsyncIterable } = require('ix');

module.exports = logic => async (req, res) => {
    try {
        AsyncIterable.from(
            (function*() {
                const output = logic(req, res);
                yield output;
            })()
        )
            .takeLast(1)
            .forEach(result => send(res, 200, result))
            .catch(e => send(res, 500, { error: e.message }));
    } catch (e) {
        send(res, 500, { error: e.message });
    }
};

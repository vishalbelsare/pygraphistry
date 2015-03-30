'use strict';

function makeErrorHandler(name) {
    return function (err) {
        console.error(name, err, (err || {}).stack);
    };
}

function observableFilter (stream, pred) {
    return function (origVal) {
        return stream
            .filter(pred)
            .map(function () {
                return origVal;
            });
    };
}

module.exports = {
    makeErrorHandler: makeErrorHandler,
    observableFilter: observableFilter
};

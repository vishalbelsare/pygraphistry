'use strict';

function makeErrorHandler(name) {
    return function (err) {
        console.error(name, err, (err || {}).stack);
    };
}

// Usage:
// mainObservableStream
//    .flatMapLatest(util.observableFilter(subStream, _.identity))
//    .do (// Here you have mainObservable filtered on subStream)
function observableFilter (stream, pred) {
    return function (origVal) {
        return stream
            .filter(pred)
            .map(function () {
                return origVal;
            });
    };
}

// inverse of _.identity
function notIdentity (val) {
    return !val;
}

module.exports = {
    makeErrorHandler: makeErrorHandler,
    observableFilter: observableFilter,
    notIdentity: notIdentity
};

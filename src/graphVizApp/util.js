'use strict';

function makeErrorHandler(name) {
    return function (err) {
        console.error(name, err, (err || {}).stack);
    };
}

function OR (a, b) {
    return a || b;
}

function AND (a, b) {
    return a && b;
}


// Usage:
// mainObservableStream
//    .flatMapLatest(util.observableFilter(subStream, _.identity))
//    .do (// Here you have mainObservable filtered on subStream)
//
// Operator is util.AND or util.OR

function observableFilter (streams, pred, operator) {

    var isArray = streams.constructor === Array;

    if (isArray) {
        if (streams.length > 2) {
            console.error('Observable Filter on 3+ elements not implemented yet');
        }
        return function (origVal) {
            return streams[0].flatMapLatest(function (val0) {
                return streams[1].map(function (val1) {
                    return {val0: val0, val1: val1};
                });
            }).filter(function (obj) {
                var v0 = pred(obj.val0);
                var v1 = pred(obj.val1);
                return operator(v0, v1);
            }).map(function () {
                return origVal;
            }).take(1);
        };

    } else {

        return function (origVal) {
            return streams
                .filter(pred)
                .map(function () {
                    return origVal;
                }).take(1);
        };
    }
}

// inverse of _.identity
function notIdentity (val) {
    return !val;
}

module.exports = {
    makeErrorHandler: makeErrorHandler,
    observableFilter: observableFilter,
    notIdentity: notIdentity,
    OR: OR,
    AND: AND
};

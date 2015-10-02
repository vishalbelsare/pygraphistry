'use strict';

var Rx      = require('rx');
var _       = require('underscore');

function makeErrorHandler(name) {
    return function (err) {
        console.error(name, err, (err || {}).stack);
    };
}

// Takes a stream and a function to run on the contents of that stream.
// It will buffer itself according to a callback.
// It includes the subscribe. TODO: Should it subscribe?
//
// First arg:   Stream
//
// Returns a stream that has hashes {data: data, ready: Rx.Subject}
// When ready for a new element, put data into ready, e.g.,
// hash.ready.onNext(hash.data)
function bufferUntilReady(stream) {
    var lastElem = new Rx.Subject();
    var newStream = new Rx.Subject();
    var replayStream = new Rx.ReplaySubject(1);

    // Feed stream into replayStream so we can
    // always handle the last request.
    stream.subscribe(replayStream, makeErrorHandler('Copying stream for util.bufferUntilReady'));

    lastElem.flatMapLatest(function (last) {
        return replayStream.filter(function (data) {
            return data !== last;
        }).take(1);
    }).do(function (data) {
        var ready = function () {
            lastElem.onNext(data);
        };
        newStream.onNext({data: data, ready: ready});
    }).subscribe(_.identity, makeErrorHandler('buffer with callback'));

    lastElem.onNext(undefined);
    return newStream;
}


function OR (a, b) {
    return a || b;
}

function AND (a, b) {
    return a && b;
}


var ALPHA_NUMERIC_RADIX = 36;


function createAlphaNumericUID() {
    return Math.random().toString(ALPHA_NUMERIC_RADIX).substring(8);
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
    createAlphaNumericUID: createAlphaNumericUID,
    notIdentity: notIdentity,
    OR: OR,
    AND: AND,
    bufferUntilReady: bufferUntilReady
};

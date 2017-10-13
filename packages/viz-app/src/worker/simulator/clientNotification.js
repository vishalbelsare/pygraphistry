'use strict';
var Q = require('q');

// Passthrough value is the value that the returned promise will be
// resolved with. You should wait on the returned promise if you want
// the client to be ~immediately updated.
function loadingStatus(socket, message, percentage, passThroughValue) {
    var payload = {
        message: message,
        percentage: percentage
    };

    socket.emit('update_loading_status', payload);

    // Because we want the timing of this to match that of initialization,
    // we need to allow the nodejs event loop to handle the socket.emit io
    // event, otherwise those will get queued up due to large synchronous
    // chunks of code.
    var deferred = Q.defer();
    process.nextTick(function() {
        deferred.resolve(passThroughValue);
    });
    return deferred.promise;
}

export { loadingStatus };

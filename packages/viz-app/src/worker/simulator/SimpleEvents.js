"use strict";
// A module-level list of all the event listeners
var listeners = {};

exports.listen = function(event, callback) {
    var eventListeners = listeners[event] || [];
    eventListeners.push(callback);
    listeners[event] = eventListeners;
};


// TODO: add 'remove' function


exports.fire = function(event, args) {
    var eventListeners = listeners[event] || [];

    for(var i in eventListeners) {
        eventListeners[i].call(this, args);
    }
};


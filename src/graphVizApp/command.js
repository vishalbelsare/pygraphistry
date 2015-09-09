'use strict';

var Rx = require('rx');

function Command(commandName, socket) {
    this.commandName = commandName;
    this.socket = socket;
}

Command.prototype.sendWithObservableResult = function(argument, disableErrorFiltering) {
    console.debug('Sent command ' + this.commandName, argument);
    var src = Rx.Observable.fromCallback(this.socket.emit, this.socket)(this.commandName, argument);
    if (disableErrorFiltering === true) {
        return src;
    }
    return src
        .do(this.makeServerErrorHandler())
        .filter(this.isServerResponseSuccess);
};

Command.prototype.makeServerErrorHandler = function(commandName) {
    if (!commandName) {
        commandName = this.commandName;
    }
    return function (reply) {
        console.debug('Server responded to ' + commandName, reply);
        if (!reply || !reply.success) {
            console.error('Server error on ' + commandName, (reply || {}).error);
        }
    };
};

Command.prototype.isServerResponseSuccess = function(reply) {
    return reply && reply.success;
};

module.exports = Command;

'use strict';

function Command(commandName, socket) {
    this.commandName = commandName;
    this.socket = socket;
}

Command.prototype.sendWithObservableResult = function(argument) {
    return Rx.Observable.fromCallback(this.socket.emit, this.socket)(this.commandName, argument)
        .do(this.makeServerErrorHandler())
        .filter(this.isServerResponseSuccess);
};

Command.prototype.makeServerErrorHandler = function(commandName) {
    if (!commandName) {
        commandName = this.commandName;
    }
    return function (reply) {
        if (!reply || !reply.success) {
            console.error('Server error on ' + commandName, (reply || {}).error);
        }
    };
};

Command.prototype.isServerResponseSuccess = function(reply) {
    return reply && reply.success;
};

module.exports = Command;

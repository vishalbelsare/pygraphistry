'use strict';

var Rx = require('rx');

function Command(description, commandName, socket, disableErrorFiltering) {
    this.description = description;
    this.commandName = commandName;
    this.socket = socket;
    this.disableErrorFiltering = (disableErrorFiltering !== undefined) ?
        disableErrorFiltering : true;
}

Command.prototype.sendWithObservableResult = function() {
    console.debug('Sent command ' + this.commandName, arguments);
    var src = Rx.Observable.fromCallback(this.socket.emit, this.socket)(this.commandName, arguments);
    if (this.disableErrorFiltering === true) {
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
